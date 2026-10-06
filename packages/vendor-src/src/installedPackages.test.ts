import { assert, describe, it, layer } from "@effect/vitest";
import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, Option, Path } from "effect";

import {
	discoverWorkspaceRoots,
	expandGlobDirs,
	InstalledPackages,
	parsePnpmWorkspacePackages,
} from "./installedPackages.ts";
import { Project } from "./project.ts";
import { json, tempDir, writeFiles } from "./testing.ts";

describe("parsePnpmWorkspacePackages", () => {
	it("reads only the packages section", () => {
		const text = `packages:
  - projects/*/*
  - "packages/*"
  - 'tooling/*' # comment

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

layer(NodeServices.layer)("workspace discovery", (it) => {
	it.effect("expands per-segment globs", () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const root = yield* tempDir;
			yield* writeFiles(root, {
				"projects/app/web/.keep": "",
				"projects/app/api/.keep": "",
				"projects/other/.keep": "",
				"packages/lib/.keep": "",
				"packages/pkg-a/.keep": "",
				"packages/README.md": "",
			});
			const expand = (pattern: string) =>
				expandGlobDirs(root, pattern).pipe(
					Effect.map((dirs) => dirs.map((dir) => path.relative(root, dir))),
				);

			assert.deepStrictEqual(yield* expand("projects/*/*"), [
				"projects/app/api",
				"projects/app/web",
			]);
			assert.deepStrictEqual(yield* expand("packages/*"), [
				"packages/lib",
				"packages/pkg-a",
			]);
			assert.deepStrictEqual(yield* expand("./packages/pkg-*/"), [
				"packages/pkg-a",
			]);
			assert.deepStrictEqual(yield* expand("packages/lib"), ["packages/lib"]);
			assert.deepStrictEqual(yield* expand("missing/*"), []);
			assert.deepStrictEqual(yield* expand("!packages/lib"), []);
			assert.deepStrictEqual(yield* expand("packages/**"), []);
		}),
	);

	it.effect("discovers pnpm and package.json workspaces", () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const root = yield* tempDir;
			yield* writeFiles(root, {
				"package.json": json({ name: "root", workspaces: ["apps/*"] }),
				"pnpm-workspace.yaml":
					"packages:\n  - packages/*\n\ncatalog:\n  effect: ^4.0.1\n",
				"apps/web/package.json": "{}",
				"packages/lib/package.json": "{}",
			});
			const roots = yield* discoverWorkspaceRoots(root);
			assert.deepStrictEqual(
				roots.map((dir) => path.relative(root, dir)),
				["", "packages/lib", "apps/web"],
			);
		}),
	);

	it.effect("ignores a malformed package.json", () =>
		Effect.gen(function* () {
			const root = yield* tempDir;
			yield* writeFiles(root, { "package.json": "{ nope" });
			assert.deepStrictEqual(yield* discoverWorkspaceRoots(root), [root]);
		}),
	);
});

const packagesAt = (root: string) =>
	InstalledPackages.layer.pipe(Layer.provide(Project.layerAt(root)));

layer(NodeServices.layer)("InstalledPackages", (it) => {
	const makeWorkspace = Effect.gen(function* () {
		const root = yield* tempDir;
		yield* writeFiles(root, {
			".git/HEAD": "ref: refs/heads/main\n",
			"package.json": json({ name: "root", private: true }),
			"pnpm-workspace.yaml": "packages:\n  - packages/*\n",
			"node_modules/effect/package.json": json({
				name: "effect",
				version: "4.0.0",
				repository: {
					type: "git",
					url: "git+https://github.com/Effect-TS/effect.git",
				},
				exports: { ".": "./index.js" },
			}),
			"packages/app/package.json": json({ name: "app" }),
			"packages/app/node_modules/effect/package.json": json({
				name: "effect",
				version: "4.0.1",
			}),
		});
		return root;
	});

	it.effect("reads package.json even when exports hide it", () =>
		Effect.gen(function* () {
			const root = yield* makeWorkspace;
			const packages = yield* Effect.provide(
				Effect.service(InstalledPackages),
				packagesAt(root),
			);
			const effect = yield* packages.packageJson("effect");
			assert.isTrue(Option.isSome(effect));
			assert.deepStrictEqual(Option.getOrThrow(effect).repository, {
				type: "git",
				url: "git+https://github.com/Effect-TS/effect.git",
			});
			assert.isTrue(Option.isNone(yield* packages.packageJson("missing")));
		}),
	);

	it.effect("picks the highest version across workspace packages", () =>
		Effect.gen(function* () {
			const root = yield* makeWorkspace;
			const packages = yield* Effect.provide(
				Effect.service(InstalledPackages),
				packagesAt(root),
			);
			assert.deepStrictEqual(
				yield* packages.version("effect"),
				Option.some("4.0.1"),
			);
			assert.deepStrictEqual(yield* packages.version("missing"), Option.none());
		}),
	);
});
