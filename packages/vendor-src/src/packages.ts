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
import { unscopedName } from "./tags.ts";

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

const DependencyFields = Schema.Struct({
	dependencies: Schema.optionalKey(
		Schema.Record(Schema.String, Schema.Unknown),
	),
	devDependencies: Schema.optionalKey(
		Schema.Record(Schema.String, Schema.Unknown),
	),
	peerDependencies: Schema.optionalKey(
		Schema.Record(Schema.String, Schema.Unknown),
	),
	optionalDependencies: Schema.optionalKey(
		Schema.Record(Schema.String, Schema.Unknown),
	),
});

const isReadonlyArray = (value: unknown): value is ReadonlyArray<unknown> =>
	Array.isArray(value);

/** A dependency declared somewhere in the workspace. */
export interface DeclaredDependency {
	readonly name: string;
	/** Project-relative directories whose package.json declares it (`.` for the root). */
	readonly declaredIn: ReadonlyArray<string>;
	/** Normalized git URL from the installed package.json, when known. */
	readonly repository?: string;
}

/** Repository name from a git URL, e.g. `https://github.com/TanStack/router.git` -> `router`. */
export const repositoryName = (url: string): string =>
	url
		.replace(/\.git$/, "")
		.split(/[/:]/)
		.filter(Boolean)
		.pop() ?? url;

/** Repository owner/name for display, e.g. `TanStack/router`. */
export const repositorySlug = (url: string): string =>
	url
		.replace(/\.git$/, "")
		.split(/[/:]/)
		.filter(Boolean)
		.slice(-2)
		.join("/");

function editDistance(left: string, right: string): number {
	let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
	for (let i = 1; i <= left.length; i++) {
		const current = [i];
		for (let j = 1; j <= right.length; j++) {
			current[j] = Math.min(
				previous[j]! + 1,
				current[j - 1]! + 1,
				previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1),
			);
		}
		previous = current;
	}
	return previous[right.length]!;
}

const scopeOf = (name: string) =>
	name.startsWith("@") ? name.slice(0, name.indexOf("/")) : undefined;

/**
 * Declared dependencies that look like what the user meant by `query`:
 * packages published from a repo named like it (e.g. `@tanstack/router` ->
 * everything from TanStack/router), names containing its unscoped part,
 * near-miss typos, then other packages from the same npm scope.
 */
export function suggestPackages(
	query: string,
	declared: ReadonlyArray<DeclaredDependency>,
	limit = 8,
): DeclaredDependency[] {
	const wanted = unscopedName(query).toLowerCase();
	const scope = scopeOf(query)?.toLowerCase();
	const rank = (dependency: DeclaredDependency): number | undefined => {
		const name = dependency.name.toLowerCase();
		if (name === query.toLowerCase()) {
			return undefined;
		}
		const unscoped = unscopedName(name);
		const sameScope = scope !== undefined && scopeOf(name) === scope;
		if (
			dependency.repository !== undefined &&
			repositoryName(dependency.repository).toLowerCase() === wanted
		) {
			return 0;
		}
		if (wanted.length >= 3 && unscoped.includes(wanted)) {
			return sameScope ? 1 : 2;
		}
		if (editDistance(unscoped, wanted) <= 2) {
			return 3;
		}
		return sameScope ? 4 : undefined;
	};
	return declared
		.flatMap((dependency) => {
			const score = rank(dependency);
			return score === undefined ? [] : [{ dependency, score }];
		})
		.toSorted(
			(left, right) =>
				left.score - right.score ||
				left.dependency.name.localeCompare(right.dependency.name),
		)
		.slice(0, limit)
		.map(({ dependency }) => dependency);
}

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
		/** Every dependency declared by the root or a workspace package.json. */
		readonly declaredDependencies: Effect.Effect<
			ReadonlyArray<DeclaredDependency>,
			PlatformError
		>;
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

			const declaredDependencies = Effect.gen(function* () {
				const byName = new Map<string, string[]>();
				for (const root of yield* workspaceRoots) {
					const pkg = yield* readJson(
						DependencyFields,
						path.join(root, "package.json"),
					).pipe(Effect.catchTag("PlatformError", () => Effect.succeedNone));
					if (Option.isNone(pkg)) {
						continue;
					}
					const dir = path.relative(project.root, root) || ".";
					const {
						dependencies,
						devDependencies,
						peerDependencies,
						optionalDependencies,
					} = pkg.value;
					const names = new Set(
						[
							dependencies,
							devDependencies,
							peerDependencies,
							optionalDependencies,
						].flatMap((fields) => Object.keys(fields ?? {})),
					);
					for (const name of names) {
						byName.set(name, [...(byName.get(name) ?? []), dir]);
					}
				}
				return [...byName].map(([name, declaredIn]) => ({ name, declaredIn }));
			}).pipe(Effect.withSpan("InstalledPackages.declaredDependencies"));

			return InstalledPackages.of({
				workspaceRoots,
				packageJson,
				declaredDependencies,
				version,
			});
		}),
	);
}
