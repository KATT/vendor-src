import {
	Context,
	Effect,
	FileSystem,
	Layer,
	Path,
	PlatformError,
	Schema,
} from "effect";

import {
	renderVendorDirAgentsMd,
	upsertAgentsBlock,
	type AgentsRepoLine,
} from "./agentsMd.ts";
import {
	mergeOxfmtConfig,
	mergeToolingIgnoreFiles,
	mergeVsCodeSettings,
	OPTIONAL_IGNORE_FILES,
	OXFMT_CONFIG_FILE,
	VSCODE_SETTINGS_FILE,
	type OptionalIgnoreFile,
} from "./editorConfig.ts";
import { ConfigFileError, decodeJsonObject, stringifyJson } from "./json.ts";
import {
	decodeManifest,
	emptyManifest,
	encodeManifest,
	MANIFEST_FILENAME,
	vendorDir,
	type Manifest,
	type ManifestError,
} from "./manifest.ts";

export class ProjectNotFoundError extends Schema.TaggedError<ProjectNotFoundError>()(
	"ProjectNotFoundError",
	{ cwd: Schema.String },
) {
	override get message() {
		return `${this.cwd} is not inside a git repository with a package.json (or a package with ${MANIFEST_FILENAME})`;
	}
}

const PackageJsonScripts = Schema.Struct({
	name: Schema.optionalKey(Schema.String),
	scripts: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});

const POSTINSTALL = "vendor-src check";

/** The project being vendored into: a git repo root that has a package.json. */
export class Project extends Context.Service<
	Project,
	{
		readonly root: string;
		/** Absolute path for a project-relative path. */
		readonly resolve: (relativePath: string) => string;
		readonly readManifest: Effect.Effect<
			Manifest,
			ManifestError | PlatformError.PlatformError
		>;
		readonly writeManifest: (
			manifest: Manifest,
		) => Effect.Effect<void, PlatformError.PlatformError>;
		/** Root `AGENTS.md` managed block and `{dir}/AGENTS.md`. */
		readonly writeAgentsMd: (
			manifest: Manifest,
		) => Effect.Effect<void, PlatformError.PlatformError>;
		/** Keep formatters, linters, and editors out of the vendor dir. */
		readonly writeToolingIgnores: (
			manifest: Manifest,
		) => Effect.Effect<void, ConfigFileError | PlatformError.PlatformError>;
		/** Add `vendor-src check` to the project's `postinstall` script. */
		readonly ensurePostinstall: Effect.Effect<
			void,
			ConfigFileError | PlatformError.PlatformError
		>;
	}
>()("vendor-src/Project") {
	/**
	 * Locate the project that contains `cwd`: the nearest git root with a
	 * package.json, or else the nearest package with a vendor-src.json (so
	 * `vendor-src check` works in checkouts without `.git`, e.g. Docker builds).
	 */
	static readonly make = Effect.fn("Project.make")(function* (cwd: string) {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		const findRoot = Effect.fnUntraced(function* () {
			let manifestDir: string | undefined;
			let dir = path.resolve(cwd);
			for (;;) {
				if (yield* fs.exists(path.join(dir, "package.json"))) {
					if (yield* fs.exists(path.join(dir, ".git"))) {
						return dir;
					}
					if (
						manifestDir === undefined &&
						(yield* fs.exists(path.join(dir, MANIFEST_FILENAME)))
					) {
						manifestDir = dir;
					}
				}
				const parent = path.dirname(dir);
				if (parent === dir) {
					if (manifestDir === undefined) {
						return yield* new ProjectNotFoundError({ cwd });
					}
					return manifestDir;
				}
				dir = parent;
			}
		});
		const root = yield* findRoot();

		const resolve = (relativePath: string) => path.join(root, relativePath);

		const readOptional = (file: string) =>
			Effect.flatMap(fs.exists(file), (exists) =>
				exists ? fs.readFileString(file) : Effect.undefined,
			);

		const writeIfChanged = (
			file: string,
			before: string | undefined,
			after: string,
		) => (before === after ? Effect.void : fs.writeFileString(file, after));

		const manifestPath = resolve(MANIFEST_FILENAME);

		const readManifest = Effect.flatMap(readOptional(manifestPath), (json) =>
			json === undefined
				? Effect.succeed(emptyManifest())
				: decodeManifest(json),
		);

		const writeManifest = Effect.fn("Project.writeManifest")(function* (
			manifest: Manifest,
		) {
			yield* fs.writeFileString(manifestPath, yield* encodeManifest(manifest));
		});

		const writeAgentsMd = Effect.fn("Project.writeAgentsMd")(function* (
			manifest: Manifest,
		) {
			const dir = vendorDir(manifest);
			const repos: AgentsRepoLine[] = Object.entries(manifest.repos).map(
				([name, repo]) => ({
					name,
					package: repo.package,
					path: `${dir}/${name}`,
					version: repo.version,
					ref: repo.ref,
				}),
			);

			// writeFileString follows AGENTS.md symlinks (e.g. → README.md)
			const rootAgents = resolve("AGENTS.md");
			const existing = yield* readOptional(rootAgents);
			yield* writeIfChanged(
				rootAgents,
				existing,
				upsertAgentsBlock(existing, repos, dir),
			);

			yield* fs.makeDirectory(resolve(dir), { recursive: true });
			const vendorAgents = resolve(`${dir}/AGENTS.md`);
			yield* writeIfChanged(
				vendorAgents,
				yield* readOptional(vendorAgents),
				renderVendorDirAgentsMd(repos, dir),
			);
		});

		const writeToolingIgnores = Effect.fn("Project.writeToolingIgnores")(
			function* (manifest: Manifest) {
				const dir = vendorDir(manifest);

				const ignoreFiles: Partial<Record<OptionalIgnoreFile, string>> = {};
				for (const file of OPTIONAL_IGNORE_FILES) {
					const contents = yield* readOptional(resolve(file));
					if (contents !== undefined) {
						ignoreFiles[file] = contents;
					}
				}
				for (const [file, contents] of Object.entries(
					mergeToolingIgnoreFiles(ignoreFiles, dir),
				)) {
					yield* writeIfChanged(
						resolve(file),
						ignoreFiles[file as OptionalIgnoreFile],
						contents,
					);
				}

				const oxfmtPath = resolve(OXFMT_CONFIG_FILE);
				const oxfmt = yield* readOptional(oxfmtPath);
				yield* writeIfChanged(
					oxfmtPath,
					oxfmt,
					yield* mergeOxfmtConfig(oxfmt, dir),
				);

				const settingsPath = resolve(VSCODE_SETTINGS_FILE);
				yield* fs.makeDirectory(path.dirname(settingsPath), {
					recursive: true,
				});
				const settings = yield* readOptional(settingsPath);
				yield* writeIfChanged(
					settingsPath,
					settings,
					yield* mergeVsCodeSettings(settings, dir),
				);
			},
		);

		const ensurePostinstall = Effect.gen(function* () {
			const file = resolve("package.json");
			const raw = yield* fs.readFileString(file);
			const json = yield* decodeJsonObject("package.json", raw);
			const pkg = yield* Schema.decodeUnknownEffect(PackageJsonScripts)(
				json,
			).pipe(
				Effect.mapError(
					(cause) => new ConfigFileError({ file: "package.json", cause }),
				),
			);
			// Never write postinstall into the published package itself.
			if (pkg.name === "vendor-src") {
				return;
			}
			const current = pkg.scripts?.postinstall;
			if (current?.includes(POSTINSTALL)) {
				return;
			}
			const postinstall = current
				? `${current} && ${POSTINSTALL}`
				: POSTINSTALL;
			yield* fs.writeFileString(
				file,
				stringifyJson(
					{ ...json, scripts: { ...pkg.scripts, postinstall } },
					raw,
				),
			);
		}).pipe(Effect.withSpan("Project.ensurePostinstall"));

		return Project.of({
			root,
			resolve,
			readManifest,
			writeManifest,
			writeAgentsMd,
			writeToolingIgnores,
			ensurePostinstall,
		});
	});

	/** The project containing `cwd`. */
	static readonly layerAt = (cwd: string) =>
		Layer.effect(Project, Project.make(cwd));
}

/** Write every file vendor-src manages after the manifest changes. */
export const writeProjectFiles = Effect.fn("writeProjectFiles")(function* (
	manifest: Manifest,
) {
	const project = yield* Project;
	yield* project.writeManifest(manifest);
	yield* project.writeAgentsMd(manifest);
	yield* project.writeToolingIgnores(manifest);
	yield* project.ensurePostinstall;
});
