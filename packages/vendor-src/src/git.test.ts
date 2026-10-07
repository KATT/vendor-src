import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Path } from "effect";

import { Git, toFetchRef } from "./git.ts";
import { Project } from "./project.ts";
import {
	git,
	isolateGitConfig,
	makeProject,
	makeUpstream,
	tempDir,
	writeFiles,
} from "./testUtils.ts";

isolateGitConfig();

const layerAt = (root: string) =>
	Git.layer.pipe(
		Layer.provide(Project.layerFrom(root)),
		Layer.provide(NodeServices.layer),
	);

describe("toFetchRef", () => {
	it("prefixes tags that contain @", () => {
		assert.strictEqual(toFetchRef("effect@4.0.1"), "refs/tags/effect@4.0.1");
	});

	it("leaves fully-qualified refs and SHAs alone", () => {
		assert.strictEqual(
			toFetchRef("refs/tags/effect@4.0.1"),
			"refs/tags/effect@4.0.1",
		);
		assert.strictEqual(toFetchRef("refs/heads/main"), "refs/heads/main");
		assert.strictEqual(toFetchRef("0123abc"), "0123abc");
	});
});

describe("Git.ensureReady", () => {
	it.live("fails when the repository has no commits", () =>
		Effect.gen(function* () {
			const root = yield* tempDir;
			git(root, "init", "-q");
			// Untracked-but-excluded so only the missing commit trips the check.
			yield* writeFiles(root, {
				"package.json": "{}",
				".git/info/exclude": "package.json\n",
			});

			const error = yield* Git.use((git) => git.ensureReady).pipe(
				Effect.provide(layerAt(root)),
				Effect.flip,
			);
			assert.strictEqual(error._tag, "WorkingTreeError");
			assert.include(error.message, "no commits yet");
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.live("fails on a dirty tree and passes on a clean one", () =>
		Effect.gen(function* () {
			const root = yield* makeProject(yield* tempDir);
			yield* Git.use((git) => git.ensureReady).pipe(
				Effect.provide(layerAt(root)),
			);

			yield* writeFiles(root, { "new.txt": "x" });
			const error = yield* Git.use((git) => git.ensureReady).pipe(
				Effect.provide(layerAt(root)),
				Effect.flip,
			);
			assert.include(error.message, "working tree is not clean");
		}).pipe(Effect.provide(NodeServices.layer)),
	);
});

describe("Git.ensureClean", () => {
	it.live("only looks at the given paths", () =>
		Effect.gen(function* () {
			const root = yield* makeProject(yield* tempDir, {
				"vendor/lib/index.ts": "export {}\n",
			});
			yield* writeFiles(root, { "package.json": "{}", "new.txt": "x" });
			yield* Git.use((git) => git.ensureClean(["vendor/lib"])).pipe(
				Effect.provide(layerAt(root)),
			);

			yield* writeFiles(root, { "vendor/lib/index.ts": "edited\n" });
			const error = yield* Git.use((git) =>
				git.ensureClean(["vendor/lib"]),
			).pipe(Effect.provide(layerAt(root)), Effect.flip);
			assert.strictEqual(error._tag, "WorkingTreeError");
			assert.include(error.message, "uncommitted changes in vendor/lib");
		}).pipe(Effect.provide(NodeServices.layer)),
	);
});

describe("Git.resolveTag", () => {
	it.live("finds the release tag on the remote", () =>
		Effect.gen(function* () {
			const root = yield* tempDir;
			const project = yield* makeProject(
				(yield* Path.Path).join(root, "project"),
			);
			const upstream = yield* makeUpstream(root, "lib", [
				{ version: "1.0.0", files: { "index.ts": "export const v = 1\n" } },
				{ version: "1.1.0", files: { "index.ts": "export const v = 2\n" } },
			]);

			const [tag, missing] = yield* Git.use((git) =>
				Effect.all([
					git.resolveTag(upstream, "lib", "1.1.0"),
					Effect.flip(git.resolveTag(upstream, "lib", "9.9.9")),
				]),
			).pipe(Effect.provide(layerAt(project)));

			assert.strictEqual(tag, "lib@1.1.0");
			assert.strictEqual(missing._tag, "TagNotFoundError");
			assert.include(missing.message, "pass --ref to override");
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.live("surfaces git's error instead of reporting a missing tag", () =>
		Effect.gen(function* () {
			const project = yield* makeProject(yield* tempDir);
			const error = yield* Git.use((git) =>
				git.resolveTag("/does/not/exist.git", "lib", "1.0.0"),
			).pipe(Effect.provide(layerAt(project)), Effect.flip);
			assert.strictEqual(error._tag, "GitError");
			assert.include(
				error.message,
				"git ls-remote --tags /does/not/exist.git failed",
			);
		}).pipe(Effect.provide(NodeServices.layer)),
	);
});
