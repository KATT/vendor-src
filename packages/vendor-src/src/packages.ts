import {
	Array as Arr,
	Context,
	Effect,
	FileSystem,
	Layer,
	Option,
	Path,
	Schema,
} from "effect";
import type { PlatformError } from "effect/PlatformError";
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
export type PackageRepository = typeof PackageRepository.Type;

/** The parts of an installed dependency's package.json that vendor-src reads. */
export const InstalledPackageJson = Schema.Struct({
	name: Schema.optionalKey(Schema.String),
	version: Schema.String,
	repository: Schema.optionalKey(PackageRepository),
});
export type InstalledPackageJson = typeof InstalledPackageJson.Type;

const WorkspacePackageJson = Schema.Struct({
	workspaces: Schema.optionalKey(
		Schema.Union([
			Schema.Array(Schema.String),
			Schema.Struct({
				packages: Schema.optionalKey(Schema.Array(Schema.String)),
			}),
		]),
	),
});

const isReadonlyArray = (value: unknown): value is ReadonlyArray<unknown> =>
	Array.isArray(value);

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

export class InstalledPackages extends Context.Service<
	InstalledPackages,
	{
		/** Directories of the project root and every workspace package. */
		readonly workspaceRoots: Effect.Effect<
			ReadonlyArray<string>,
			PlatformError
		>;
		/**
		 * The package.json of `name` as installed for the root or any workspace
		 * package; the highest version wins when several are installed.
		 */
		readonly packageJson: (
			name: string,
		) => Effect.Effect<Option.Option<InstalledPackageJson>, PlatformError>;
		/** The highest version of `name` installed across workspace roots. */
		readonly version: (
			name: string,
		) => Effect.Effect<Option.Option<string>, PlatformError>;
	}
>()("vendor-src/InstalledPackages") {
	static readonly layer = Layer.effect(
		InstalledPackages,
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			const project = yield* Project;

			const isDirectory = (dir: string) =>
				fs.stat(dir).pipe(
					Effect.map((info) => info.type === "Directory"),
					Effect.orElseSucceed(() => false),
				);

			const readJson = <S extends Schema.Top>(schema: S, file: string) =>
				fs.readFileString(file).pipe(
					Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(schema))),
					Effect.map(Option.some),
					Effect.catchTag("SchemaError", () => Effect.succeedNone),
				);

			/** Expand a workspace glob such as `packages/*` or `apps/*\/web`. */
			const expandGlob = (
				base: string,
				parts: ReadonlyArray<string>,
			): Effect.Effect<ReadonlyArray<string>, PlatformError> => {
				const [head, ...tail] = parts;
				if (head === undefined) {
					return Effect.map(isDirectory(base), (isDir) =>
						isDir ? [base] : [],
					);
				}
				if (head === "**") {
					// Recursive workspace globs are rare; not supported.
					return Effect.succeed([]);
				}
				if (!head.includes("*")) {
					return expandGlob(path.join(base, head), tail);
				}
				const matches = picomatch(head);
				return Effect.gen(function* () {
					if (!(yield* isDirectory(base))) {
						return [];
					}
					const names = yield* fs.readDirectory(base);
					const nested = yield* Effect.forEach(
						names.filter((name) => matches(name)).toSorted(),
						(name) => expandGlob(path.join(base, name), tail),
					);
					return nested.flat();
				});
			};

			const expandPatterns = (patterns: ReadonlyArray<string>) =>
				Effect.forEach(patterns, (pattern) =>
					expandGlob(
						project.root,
						pattern
							.replaceAll("\\", "/")
							.replace(/\/$/, "")
							.split("/")
							.filter(Boolean),
					),
				).pipe(Effect.map((dirs) => dirs.flat()));

			const workspaceRoots = yield* Effect.cached(
				Effect.gen(function* () {
					const roots = [project.root];

					const pnpmWorkspace = project.resolve("pnpm-workspace.yaml");
					if (yield* fs.exists(pnpmWorkspace)) {
						const text = yield* fs.readFileString(pnpmWorkspace);
						roots.push(
							...(yield* expandPatterns(parsePnpmWorkspacePackages(text))),
						);
					}

					const pkg = yield* readJson(
						WorkspacePackageJson,
						project.resolve("package.json"),
					);
					const workspaces = Option.getOrUndefined(pkg)?.workspaces;
					const patterns =
						workspaces === undefined
							? []
							: isReadonlyArray(workspaces)
								? workspaces
								: (workspaces.packages ?? []);
					roots.push(...(yield* expandPatterns(patterns)));

					return [...new Set(roots)];
				}).pipe(Effect.withSpan("InstalledPackages.workspaceRoots")),
			);

			/** Walk up from `from` like Node's resolver, without consulting `exports`. */
			const resolveFrom = Effect.fnUntraced(function* (
				from: string,
				name: string,
			) {
				for (let dir = from; ; dir = path.dirname(dir)) {
					const file = path.join(dir, "node_modules", name, "package.json");
					if (yield* fs.exists(file)) {
						return yield* readJson(InstalledPackageJson, file);
					}
					if (path.dirname(dir) === dir) {
						return Option.none<InstalledPackageJson>();
					}
				}
			});

			const packageJson = Effect.fn("InstalledPackages.packageJson")(function* (
				name: string,
			) {
				const roots = yield* workspaceRoots;
				const found = Arr.getSomes(
					yield* Effect.forEach(roots, (root) => resolveFrom(root, name)),
				);
				const highest = maxSemver(found.map((pkg) => pkg.version));
				return Option.fromUndefinedOr(
					found.find((pkg) => pkg.version === highest),
				);
			});

			const version = Effect.fn("InstalledPackages.version")(function* (
				name: string,
			) {
				return Option.map(yield* packageJson(name), (pkg) => pkg.version);
			});

			return InstalledPackages.of({ workspaceRoots, packageJson, version });
		}),
	);
}
