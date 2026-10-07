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
	removeAgentsBlock,
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
	encodeManifest,
	MANIFEST_FILENAME,
	ManifestNotFoundError,
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

const POSTINSTALL = "vendor-src check --sync";
const CHECK_COMMAND = "vendor-src check";

const CheckoutPackageJson = Schema.fromJsonString(
	Schema.Struct({ version: Schema.optionalKey(Schema.String) }),
);

/** Project-relative paths a write step created or modified. */
export type ChangedFiles = ReadonlyArray<string>;

/** `Occupied` when another `postinstall` exists and was left as is. */
export type PostinstallResult =
	| { readonly _tag: "Ready"; readonly changed: ChangedFiles }
	| {
			readonly _tag: "Occupied";
			readonly existing: string;
			/** The same script, extended to also run `vendor-src check --sync`. */
			readonly suggested: string;
	  };

export class Project extends Context.Service<
	Project,
	{
		/** Absolute path of the directory holding `.git` and `package.json`. */
		readonly root: string;
		/** Resolve a project-relative path to an absolute path. */
		readonly resolve: (...segments: ReadonlyArray<string>) => string;
		/** `vendor-src.json`, or none when the project has not been initialized. */
		readonly findManifest: Effect.Effect<
			Option.Option<Manifest>,
			ManifestError | PlatformError
		>;
		/** `vendor-src.json`, failing when the project has not been initialized. */
		readonly readManifest: Effect.Effect<
			Manifest,
			ManifestError | ManifestNotFoundError | PlatformError
		>;
		readonly writeManifest: (
			manifest: Manifest,
		) => Effect.Effect<ChangedFiles, PlatformError>;
		/**
		 * Refresh the `{dir}/AGENTS.md` file, and the managed block in the root
		 * `AGENTS.md` (or remove that block when `rootAgentsMd` is false).
		 */
		readonly writeAgentsMd: (
			manifest: Manifest,
		) => Effect.Effect<ChangedFiles, PlatformError>;
		/** Keep formatters, linters, and editors out of the vendor dir. */
		readonly writeEditorIgnores: (
			manifest: Manifest,
		) => Effect.Effect<ChangedFiles, ConfigFileError | PlatformError>;
		/** The `version` in `{path}/package.json` inside a checkout, if readable. */
		readonly checkoutPackageVersion: (
			path: string,
		) => Effect.Effect<Option.Option<string>, PlatformError>;
		/**
		 * Make `vendor-src check --sync` the project's `postinstall` script, unless
		 * another `postinstall` already exists.
		 */
		readonly ensurePostinstall: Effect.Effect<
			PostinstallResult,
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

		/**
		 * Write `contents` to a project-relative file unless it already matches.
		 * Follows symlinks (e.g. AGENTS.md → README.md).
		 */
		const writeIfChanged = Effect.fnUntraced(function* (
			file: string,
			contents: string,
		) {
			const existing = yield* readOptional(resolve(file));
			if (Option.isSome(existing) && existing.value === contents) {
				return [];
			}
			yield* fs.makeDirectory(path.dirname(resolve(file)), {
				recursive: true,
			});
			yield* fs.writeFileString(resolve(file), contents);
			return [file];
		});

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
			return yield* writeIfChanged(file, merged);
		});

		const findManifest = readOptional(resolve(MANIFEST_FILENAME)).pipe(
			Effect.flatMap(
				Option.match({
					onNone: () => Effect.succeedNone,
					onSome: (raw) =>
						Effect.map(decodeManifest(raw, MANIFEST_FILENAME), Option.some),
				}),
			),
			Effect.withSpan("Project.findManifest"),
		);

		const readManifest = findManifest.pipe(
			Effect.flatMap(
				Option.match({
					onNone: () => Effect.fail(new ManifestNotFoundError({ root })),
					onSome: Effect.succeed,
				}),
			),
			Effect.withSpan("Project.readManifest"),
		);

		const writeManifest = Effect.fn("Project.writeManifest")(function* (
			manifest: Manifest,
		) {
			return yield* writeIfChanged(MANIFEST_FILENAME, encodeManifest(manifest));
		});

		const checkoutPackageVersion = Effect.fn("Project.checkoutPackageVersion")(
			function* (packagePath: string) {
				const raw = yield* readOptional(resolve(packagePath, "package.json"));
				if (Option.isNone(raw)) {
					return Option.none<string>();
				}
				return yield* Schema.decodeEffect(CheckoutPackageJson)(raw.value).pipe(
					Effect.map(({ version }) => Option.fromUndefinedOr(version)),
					Effect.orElseSucceed(() => Option.none<string>()),
				);
			},
		);

		const writeAgentsMd = Effect.fn("Project.writeAgentsMd")(function* (
			manifest: Manifest,
		) {
			const dir = vendorDir(manifest);
			const repos: AgentsRepoLine[] = Object.entries(manifest.repos).map(
				([name, repo]) => ({
					name,
					packages: repo.packages,
					path: repoPrefix(manifest, name),
					version: repo.version,
					ref: repo.ref,
				}),
			);

			const changed: string[] = [];
			const existing = yield* readOptional(resolve("AGENTS.md"));
			if (manifest.rootAgentsMd) {
				changed.push(
					...(yield* writeIfChanged(
						"AGENTS.md",
						upsertAgentsBlock(Option.getOrUndefined(existing), repos, dir),
					)),
				);
			} else if (Option.isSome(existing)) {
				changed.push(
					...(yield* writeIfChanged(
						"AGENTS.md",
						removeAgentsBlock(existing.value),
					)),
				);
			}

			changed.push(
				...(yield* writeIfChanged(
					`${dir}/AGENTS.md`,
					renderVendorDirAgentsMd(repos, dir),
				)),
			);
			return changed;
		});

		const writeEditorIgnores = Effect.fn("Project.writeEditorIgnores")(
			function* (manifest: Manifest) {
				const dir = vendorDir(manifest);
				const changed: string[] = [];

				for (const file of OPTIONAL_IGNORE_FILES) {
					const existing = yield* readOptional(resolve(file));
					if (Option.isSome(existing)) {
						changed.push(
							...(yield* writeIfChanged(
								file,
								mergeIgnoreFile(existing.value, dir),
							)),
						);
					}
				}

				changed.push(
					...(yield* mergeConfig(OXFMT_CONFIG_FILE, (text) =>
						mergeOxfmtConfig(text, dir),
					)),
				);
				changed.push(
					...(yield* mergeConfig(".vscode/settings.json", (text) =>
						mergeVsCodeSettings(text, dir),
					)),
				);
				return changed;
			},
		);

		const ensurePostinstall = Effect.gen(function* () {
			const raw = yield* fs.readFileString(resolve("package.json"));
			const json = yield* Schema.decodeEffect(JsonObject)(raw);
			const { name, scripts } =
				yield* Schema.decodeUnknownEffect(PackageJsonFields)(json);
			// Never write postinstall into the published package itself.
			if (name === "vendor-src") {
				return { _tag: "Ready", changed: [] } satisfies PostinstallResult;
			}
			const current = scripts?.postinstall?.trim() ?? "";
			if (current.includes(POSTINSTALL)) {
				return { _tag: "Ready", changed: [] } satisfies PostinstallResult;
			}
			// A bare `vendor-src check` is the hook vendor-src itself used to write.
			if (current !== "" && current !== CHECK_COMMAND) {
				return {
					_tag: "Occupied",
					existing: current,
					suggested: current.includes(CHECK_COMMAND)
						? current.replace(CHECK_COMMAND, POSTINSTALL)
						: `${current} && ${POSTINSTALL}`,
				} satisfies PostinstallResult;
			}
			const updated = {
				...json,
				scripts: { ...scripts, postinstall: POSTINSTALL },
			};
			const changed = yield* writeIfChanged(
				"package.json",
				`${JSON.stringify(updated, null, detectIndent(raw))}\n`,
			);
			return { _tag: "Ready", changed } satisfies PostinstallResult;
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
			findManifest,
			readManifest,
			writeManifest,
			writeAgentsMd,
			writeEditorIgnores,
			checkoutPackageVersion,
			ensurePostinstall,
		});
	});

	/** Project found from `cwd` (defaults to the process working directory). */
	static readonly layerFrom = (cwd: string = ".") =>
		Layer.effect(Project, Project.make(cwd));
}
