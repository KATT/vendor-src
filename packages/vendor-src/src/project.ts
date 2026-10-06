import {
	Context,
	Effect,
	FileSystem,
	Layer,
	Option,
	Path,
	Schema,
} from "effect";
import type { PlatformError } from "effect/PlatformError";

import {
	renderVendorDirAgentsMd,
	upsertAgentsBlock,
	type AgentsRepoLine,
} from "./agentsMd.ts";
import {
	detectIndent,
	mergeIgnoreFile,
	mergeOxfmtConfig,
	mergeVsCodeSettings,
	OPTIONAL_IGNORE_FILES,
	OXFMT_CONFIG_FILE,
} from "./editorConfig.ts";
import {
	decodeManifest,
	emptyManifest,
	encodeManifest,
	MANIFEST_FILENAME,
	repoPrefix,
	vendorDir,
	type Manifest,
	type ManifestError,
} from "./manifest.ts";

export class ProjectNotFoundError extends Schema.TaggedError<ProjectNotFoundError>()(
	"ProjectNotFoundError",
	{ cwd: Schema.String },
) {
	override get message() {
		return `${this.cwd} is not inside a git repository with a package.json`;
	}
}

export class ConfigFileError extends Schema.TaggedError<ConfigFileError>()(
	"ConfigFileError",
	{
		path: Schema.String,
		reason: Schema.String,
	},
) {
	override get message() {
		return `${this.path} is not valid JSON/JSONC; fix it before running vendor-src (${this.reason})`;
	}
}

const JsonObject = Schema.fromJsonString(
	Schema.Record(Schema.String, Schema.Unknown),
);

/** The package.json fields we read; the rest is written back untouched and in order. */
const PackageJsonFields = Schema.Struct({
	name: Schema.optionalKey(Schema.String),
	scripts: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});

const POSTINSTALL = "vendor-src check";

export class Project extends Context.Service<
	Project,
	{
		/** Absolute path of the directory holding `.git` and `package.json`. */
		readonly root: string;
		/** Resolve a project-relative path to an absolute path. */
		readonly resolve: (...segments: ReadonlyArray<string>) => string;
		readonly readManifest: Effect.Effect<
			Manifest,
			ManifestError | PlatformError
		>;
		readonly writeManifest: (
			manifest: Manifest,
		) => Effect.Effect<void, PlatformError>;
		/** Refresh the managed block in `AGENTS.md` and the `{dir}/AGENTS.md` file. */
		readonly writeAgentsMd: (
			manifest: Manifest,
		) => Effect.Effect<void, PlatformError>;
		/** Keep formatters, linters, and editors out of the vendor dir. */
		readonly writeEditorIgnores: (
			manifest: Manifest,
		) => Effect.Effect<void, ConfigFileError | PlatformError>;
		/** Add `vendor-src check` to the project's `postinstall` script. */
		readonly ensurePostinstall: Effect.Effect<
			void,
			ConfigFileError | PlatformError
		>;
	}
>()("vendor-src/Project") {
	/** Find the project root at or above `cwd`. */
	static readonly make = Effect.fn("Project.make")(function* (cwd: string) {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		const start = path.resolve(cwd);
		let root = start;
		while (
			!(yield* fs.exists(path.join(root, ".git"))) ||
			!(yield* fs.exists(path.join(root, "package.json")))
		) {
			const parent = path.dirname(root);
			if (parent === root) {
				return yield* new ProjectNotFoundError({ cwd: start });
			}
			root = parent;
		}

		const resolve = (...segments: ReadonlyArray<string>) =>
			path.join(root, ...segments);

		const readOptional = (file: string) =>
			fs
				.exists(file)
				.pipe(
					Effect.flatMap((exists) =>
						exists
							? Effect.map(fs.readFileString(file), Option.some)
							: Effect.succeedNone,
					),
				);

		/** Merge a JSON(C) config file, writing only when the contents change. */
		const mergeConfig = Effect.fnUntraced(function* (
			file: string,
			merge: (existing: string | undefined) => string,
		) {
			const existing = Option.getOrUndefined(
				yield* readOptional(resolve(file)),
			);
			const merged = yield* Effect.try({
				try: () => merge(existing),
				catch: (cause) =>
					new ConfigFileError({
						path: file,
						reason: cause instanceof Error ? cause.message : String(cause),
					}),
			});
			if (existing !== merged) {
				yield* fs.makeDirectory(path.dirname(resolve(file)), {
					recursive: true,
				});
				yield* fs.writeFileString(resolve(file), merged);
			}
		});

		const readManifest = readOptional(resolve(MANIFEST_FILENAME)).pipe(
			Effect.flatMap(
				Option.match({
					onNone: () => Effect.succeed(emptyManifest),
					onSome: (raw) => decodeManifest(raw, MANIFEST_FILENAME),
				}),
			),
			Effect.withSpan("Project.readManifest"),
		);

		const writeManifest = Effect.fn("Project.writeManifest")(function* (
			manifest: Manifest,
		) {
			yield* fs.writeFileString(
				resolve(MANIFEST_FILENAME),
				encodeManifest(manifest),
			);
		});

		const writeAgentsMd = Effect.fn("Project.writeAgentsMd")(function* (
			manifest: Manifest,
		) {
			const dir = vendorDir(manifest);
			const repos: AgentsRepoLine[] = Object.entries(manifest.repos).map(
				([name, repo]) => ({
					name,
					package: repo.package,
					path: repoPrefix(manifest, name),
					version: repo.version,
					ref: repo.ref,
				}),
			);

			// writeFileString follows AGENTS.md symlinks (e.g. → README.md)
			const rootAgents = resolve("AGENTS.md");
			const existing = yield* readOptional(rootAgents);
			yield* fs.writeFileString(
				rootAgents,
				upsertAgentsBlock(Option.getOrUndefined(existing), repos, dir),
			);

			yield* fs.makeDirectory(resolve(dir), { recursive: true });
			yield* fs.writeFileString(
				resolve(dir, "AGENTS.md"),
				renderVendorDirAgentsMd(repos, dir),
			);
		});

		const writeEditorIgnores = Effect.fn("Project.writeEditorIgnores")(
			function* (manifest: Manifest) {
				const dir = vendorDir(manifest);

				for (const file of OPTIONAL_IGNORE_FILES) {
					const existing = yield* readOptional(resolve(file));
					if (Option.isSome(existing)) {
						const merged = mergeIgnoreFile(existing.value, dir);
						if (merged !== existing.value) {
							yield* fs.writeFileString(resolve(file), merged);
						}
					}
				}

				yield* mergeConfig(OXFMT_CONFIG_FILE, (text) =>
					mergeOxfmtConfig(text, dir),
				);
				yield* mergeConfig(".vscode/settings.json", (text) =>
					mergeVsCodeSettings(text, dir),
				);
			},
		);

		const ensurePostinstall = Effect.gen(function* () {
			const file = resolve("package.json");
			const raw = yield* fs.readFileString(file);
			const json = yield* Schema.decodeEffect(JsonObject)(raw);
			const { name, scripts } =
				yield* Schema.decodeUnknownEffect(PackageJsonFields)(json);
			// Never write postinstall into the published package itself.
			if (name === "vendor-src") {
				return;
			}
			const current = scripts?.postinstall;
			if (current?.includes(POSTINSTALL)) {
				return;
			}
			const updated = {
				...json,
				scripts: {
					...scripts,
					postinstall: current ? `${current} && ${POSTINSTALL}` : POSTINSTALL,
				},
			};
			yield* fs.writeFileString(
				file,
				`${JSON.stringify(updated, null, detectIndent(raw))}\n`,
			);
		}).pipe(
			Effect.catchTag("SchemaError", (error) =>
				Effect.fail(
					new ConfigFileError({ path: "package.json", reason: error.message }),
				),
			),
			Effect.withSpan("Project.ensurePostinstall"),
		);

		return Project.of({
			root,
			resolve,
			readManifest,
			writeManifest,
			writeAgentsMd,
			writeEditorIgnores,
			ensurePostinstall,
		});
	});

	/** Project found from `cwd` (defaults to the process working directory). */
	static readonly layerFrom = (cwd: string = ".") =>
		Layer.effect(Project, Project.make(cwd));
}
