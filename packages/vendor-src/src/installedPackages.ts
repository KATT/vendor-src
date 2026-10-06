import {
	Context,
	Effect,
	FileSystem,
	Layer,
	Option,
	Path,
	PlatformError,
	Schema,
} from "effect";
import picomatch from "picomatch";

import { Project } from "./project.ts";
import { maxSemver } from "./semver.ts";

export const PackageRepository = Schema.Union([
	Schema.String,
	Schema.Struct({
		type: Schema.optionalKey(Schema.String),
		url: Schema.optionalKey(Schema.String),
		directory: Schema.optionalKey(Schema.String),
	}),
]);

export const PackageJson = Schema.Struct({
	name: Schema.optionalKey(Schema.String),
	version: Schema.NonEmptyString,
	repository: Schema.optionalKey(PackageRepository),
});
export type PackageJson = typeof PackageJson.Type;

const PackageJsonFromString = Schema.fromJsonString(PackageJson);

const WorkspaceList = Schema.Array(Schema.String);
const isWorkspaceList = Schema.is(WorkspaceList);

const WorkspacesField = Schema.fromJsonString(
	Schema.Struct({
		workspaces: Schema.optionalKey(
			Schema.Union([
				WorkspaceList,
				Schema.Struct({
					packages: Schema.optionalKey(Schema.Array(Schema.String)),
				}),
			]),
		),
	}),
);

/** Packages installed in the project's `node_modules` trees. */
export class InstalledPackages extends Context.Service<
	InstalledPackages,
	{
		/** `package.json` of a dependency, resolved from the project root. */
		readonly packageJson: (
			packageName: string,
		) => Effect.Effect<Option.Option<PackageJson>, PlatformError.PlatformError>;
		/** Highest installed version across the project and its workspace packages. */
		readonly version: (
			packageName: string,
		) => Effect.Effect<Option.Option<string>, PlatformError.PlatformError>;
	}
>()("vendor-src/InstalledPackages") {
	static readonly layer = Layer.effect(
		InstalledPackages,
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			const { root } = yield* Project;

			const readPackageJson = (file: string) =>
				Effect.flatMap(fs.exists(file), (exists) =>
					exists
						? fs
								.readFileString(file)
								.pipe(
									Effect.flatMap((json) =>
										Schema.decodeUnknownEffect(PackageJsonFromString)(
											json,
										).pipe(Effect.option),
									),
								)
						: Effect.succeedNone,
				);

			/** Node-style lookup: `<dir>/node_modules/<name>` from `from` up to the filesystem root. */
			const resolveFrom = Effect.fnUntraced(function* (
				from: string,
				packageName: string,
			) {
				let dir = from;
				for (;;) {
					const found = yield* readPackageJson(
						path.join(dir, "node_modules", packageName, "package.json"),
					);
					if (Option.isSome(found)) {
						return found;
					}
					const parent = path.dirname(dir);
					if (parent === dir) {
						return Option.none<PackageJson>();
					}
					dir = parent;
				}
			});

			const workspaceRoots = yield* Effect.cached(
				discoverWorkspaceRoots(root).pipe(
					Effect.provideService(FileSystem.FileSystem, fs),
					Effect.provideService(Path.Path, path),
				),
			);

			const packageJson = (packageName: string) =>
				resolveFrom(root, packageName).pipe(
					Effect.withSpan("InstalledPackages.packageJson", {
						attributes: { packageName },
					}),
				);

			const version = Effect.fn("InstalledPackages.version")(function* (
				packageName: string,
			) {
				const versions = new Set<string>();
				for (const dir of yield* workspaceRoots) {
					const found = yield* resolveFrom(dir, packageName);
					if (Option.isSome(found)) {
						versions.add(found.value.version);
					}
				}
				return Option.fromUndefinedOr(maxSemver(versions));
			});

			return InstalledPackages.of({ packageJson, version });
		}),
	);
}

/** The project root plus every workspace package directory (pnpm, npm, yarn, bun). */
export const discoverWorkspaceRoots = Effect.fn("discoverWorkspaceRoots")(
	function* (root: string) {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		const patterns: string[] = [];
		const pnpmWorkspace = path.join(root, "pnpm-workspace.yaml");
		if (yield* fs.exists(pnpmWorkspace)) {
			patterns.push(
				...parsePnpmWorkspacePackages(yield* fs.readFileString(pnpmWorkspace)),
			);
		}
		const packageJson = path.join(root, "package.json");
		if (yield* fs.exists(packageJson)) {
			const workspaces = yield* fs.readFileString(packageJson).pipe(
				Effect.flatMap(Schema.decodeUnknownEffect(WorkspacesField)),
				Effect.map(({ workspaces }) =>
					isWorkspaceList(workspaces)
						? workspaces
						: (workspaces?.packages ?? []),
				),
				// A malformed package.json just means no workspaces here.
				Effect.catchTag("SchemaError", () => Effect.succeed([])),
			);
			patterns.push(...workspaces);
		}

		const dirs = [root];
		for (const pattern of patterns) {
			dirs.push(...(yield* expandGlobDirs(root, pattern)));
		}
		return [...new Set(dirs)];
	},
);

/**
 * Extract `packages:` glob entries from pnpm-workspace.yaml.
 * Ignores catalog / onlyBuiltDependencies / other list sections.
 */
export function parsePnpmWorkspacePackages(text: string): string[] {
	const patterns: string[] = [];
	let inPackages = false;
	for (const line of text.split(/\r?\n/)) {
		if (/^\s*#/.test(line) || line.trim() === "") {
			continue;
		}
		const section = line.match(/^([A-Za-z][\w-]*)\s*:/);
		if (section) {
			inPackages = section[1] === "packages";
			continue;
		}
		if (!inPackages) {
			continue;
		}
		const item = line.match(/^\s*-\s*['"]?([^'"#\n]+?)['"]?\s*(?:#.*)?$/);
		if (item?.[1]) {
			patterns.push(item[1].trim());
		}
	}
	return patterns;
}

/**
 * Expand a workspace glob into existing directories. Supports per-segment
 * globs such as `packages/*`, `projects/*\/*`, and `pkg-*`; negations and
 * `**` are skipped.
 */
export const expandGlobDirs = Effect.fnUntraced(function* (
	root: string,
	pattern: string,
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;

	const normalized = pattern
		.replaceAll("\\", "/")
		.replace(/^\.\//, "")
		.replace(/\/+$/, "");
	if (!normalized || normalized.startsWith("!") || normalized.includes("**")) {
		return [];
	}

	const isDirectory = (dir: string) =>
		fs.stat(dir).pipe(
			Effect.map((info) => info.type === "Directory"),
			Effect.orElseSucceed(() => false),
		);

	let current = [root];
	for (const segment of normalized.split("/")) {
		const next: string[] = [];
		for (const base of current) {
			if (!picomatch.scan(segment).isGlob) {
				next.push(path.join(base, segment));
				continue;
			}
			if (!(yield* isDirectory(base))) {
				continue;
			}
			const matches = picomatch(segment);
			for (const name of (yield* fs.readDirectory(base)).toSorted()) {
				if (matches(name)) {
					next.push(path.join(base, name));
				}
			}
		}
		current = next;
	}

	const dirs: string[] = [];
	for (const dir of current) {
		if (yield* isDirectory(dir)) {
			dirs.push(dir);
		}
	}
	return dirs;
});
