import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Option, Path } from "effect";

import {
	InstalledPackages,
	parsePnpmWorkspacePackages,
	suggestPackages,
} from "./packages.ts";
import { Project } from "./project.ts";
import {
	installPackage,
	isolateGitConfig,
	makeProject,
	tempDir,
	writeFiles,
} from "./testUtils.ts";

isolateGitConfig();

const layerAt = (root: string) =>
	InstalledPackages.layer.pipe(Layer.provideMerge(Project.layerFrom(root)));

describe("parsePnpmWorkspacePackages", () => {
	it("reads only the packages section", () => {
		const text = `packages:
  - projects/*/*
  - "packages/*" # libraries
  - 'tooling/*'

catalog:
  effect: ^4.0.1
  vendor-src: ^0.3.2

onlyBuiltDependencies:
  - esbuild
`;
		assert.deepStrictEqual(parsePnpmWorkspacePackages(text), [
			"projects/*/*",
			"packages/*",
			"tooling/*",
		]);
	});
});

describe("suggestPackages", () => {
	const declared = [
		"@tanstack/react-router",
		"@tanstack/react-router-devtools",
		"@tanstack/react-start",
		"@tanstack/react-query",
		"effect",
		"react",
		"zod",
	].map((name) => ({ name, declaredIn: ["apps/web"] }));
	const names = (query: string) =>
		suggestPackages(query, declared).map(({ name }) => name);

	it("puts name matches first, then the rest of the scope", () => {
		assert.deepStrictEqual(names("@tanstack/router"), [
			"@tanstack/react-router",
			"@tanstack/react-router-devtools",
			"@tanstack/react-query",
			"@tanstack/react-start",
		]);
	});

	it("ranks packages from a repo named like the query first", () => {
		const router = "https://github.com/TanStack/router.git";
		const withRepos = declared.map((dependency) =>
			dependency.name === "@tanstack/react-start" ||
			dependency.name === "@tanstack/react-router"
				? { ...dependency, repository: router }
				: dependency,
		);
		assert.deepStrictEqual(
			suggestPackages("@tanstack/router", withRepos).map(({ name }) => name),
			[
				"@tanstack/react-router",
				"@tanstack/react-start",
				"@tanstack/react-router-devtools",
				"@tanstack/react-query",
			],
		);
	});

	it("catches typos and unscoped names", () => {
		assert.deepStrictEqual(names("efect"), ["effect"]);
		assert.deepStrictEqual(names("react-start"), ["@tanstack/react-start"]);
	});

	it("suggests nothing for unrelated names", () => {
		assert.deepStrictEqual(names("lodash"), []);
	});
});

describe("InstalledPackages", () => {
	it.effect(
		"discovers pnpm and npm workspace roots, including nested globs",
		() =>
			Effect.gen(function* () {
				const path = yield* Path.Path;
				const root = yield* makeProject(yield* tempDir, {
					"package.json": JSON.stringify({
						name: "root",
						workspaces: ["tools/*"],
					}),
					"pnpm-workspace.yaml": `packages:\n  - projects/*/*\n  - packages/lib-*\n\ncatalog:\n  effect: ^4.0.1\n`,
					"projects/app/web/package.json": "{}",
					"projects/app/api/package.json": "{}",
					"projects/other.txt": "",
					"packages/lib-a/package.json": "{}",
					"packages/other/package.json": "{}",
					"tools/cli/package.json": "{}",
				});

				const roots = yield* InstalledPackages.use((packages) =>
					Effect.map(packages.workspaceRoots, (dirs) => dirs.toSorted()),
				).pipe(Effect.provide(layerAt(root)));

				assert.deepStrictEqual(
					roots,
					[
						root,
						path.join(root, "packages", "lib-a"),
						path.join(root, "projects", "app", "api"),
						path.join(root, "projects", "app", "web"),
						path.join(root, "tools", "cli"),
					].toSorted(),
				);
			}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("reads package.json even when the package's exports hide it", () =>
		Effect.gen(function* () {
			const root = yield* makeProject(yield* tempDir);
			yield* installPackage(root, "@scope/pkg", "1.2.3", "github:org/pkg");

			const pkg = yield* InstalledPackages.use((packages) =>
				packages.packageJson("@scope/pkg"),
			).pipe(Effect.provide(layerAt(root)));

			assert.deepStrictEqual(
				Option.map(pkg, ({ name, version, repository }) => ({
					name,
					version,
					repository,
				})),
				Option.some({
					name: "@scope/pkg",
					version: "1.2.3",
					repository: "github:org/pkg",
				}),
			);
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect(
		"finds packages installed only in a workspace package, preferring the highest version",
		() =>
			Effect.gen(function* () {
				const path = yield* Path.Path;
				const root = yield* makeProject(yield* tempDir, {
					"pnpm-workspace.yaml": "packages:\n  - apps/*\n",
					"apps/web/package.json": "{}",
					"apps/docs/package.json": "{}",
				});
				yield* installPackage(
					path.join(root, "apps", "web"),
					"@scope/pkg",
					"1.2.3",
					"github:org/pkg",
				);
				yield* installPackage(
					path.join(root, "apps", "docs"),
					"@scope/pkg",
					"1.10.0",
					"github:org/pkg-next",
				);

				const pkg = yield* InstalledPackages.use((packages) =>
					packages.packageJson("@scope/pkg"),
				).pipe(Effect.provide(layerAt(root)));

				assert.deepStrictEqual(
					Option.map(pkg, ({ version, repository }) => ({
						version,
						repository,
					})),
					Option.some({ version: "1.10.0", repository: "github:org/pkg-next" }),
				);
			}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("picks the highest version installed across the workspace", () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const root = yield* makeProject(yield* tempDir, {
				"pnpm-workspace.yaml": "packages:\n  - packages/*\n",
				"packages/a/package.json": "{}",
				"packages/b/package.json": "{}",
			});
			yield* installPackage(root, "effect", "4.0.0-rc.118");
			yield* installPackage(
				path.join(root, "packages", "a"),
				"effect",
				"4.0.1",
			);
			yield* installPackage(
				path.join(root, "packages", "b"),
				"effect",
				"3.19.0",
			);
			yield* writeFiles(root, {
				"node_modules/broken/package.json": "{ not json",
			});

			const [effect, missing, broken] = yield* InstalledPackages.use(
				(packages) =>
					Effect.all([
						packages.version("effect"),
						packages.version("missing"),
						packages.version("broken"),
					]),
			).pipe(Effect.provide(layerAt(root)));

			assert.deepStrictEqual(effect, Option.some("4.0.1"));
			assert.deepStrictEqual(missing, Option.none());
			assert.deepStrictEqual(broken, Option.none());
		}).pipe(Effect.provide(NodeServices.layer)),
	);
});
