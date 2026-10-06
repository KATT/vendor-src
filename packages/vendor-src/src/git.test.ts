import { assert, describe, it, layer } from "@effect/vitest";
import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, Path } from "effect";

import { Git, toFetchRef } from "./git.ts";
import { Project } from "./project.ts";
import {
	commitAll,
	git,
	gitInit,
	json,
	tempDir,
	writeFiles,
} from "./testing.ts";

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

const gitAt = (root: string) =>
	Effect.provide(
		Effect.service(Git),
		Git.layer.pipe(Layer.provide(Project.layerAt(root))),
	);

const makeRepo = Effect.gen(function* () {
	const root = yield* tempDir;
	yield* gitInit(root);
	yield* writeFiles(root, { "package.json": json({ name: "app" }) });
	return root;
});

layer(NodeServices.layer)("Git", (it) => {
	it.effect("requires at least one commit", () =>
		Effect.gen(function* () {
			const root = yield* makeRepo;
			yield* git(root, "add", "-A");
			const error = yield* Effect.flip(
				(yield* gitAt(root)).ensureCleanWorkingTree,
			);
			assert.deepStrictEqual(
				[error._tag, error.message],
				[
					"WorkingTreeError",
					"the repository has no commits yet; make an initial commit first",
				],
			);
		}),
	);

	it.effect("requires a clean working tree", () =>
		Effect.gen(function* () {
			const root = yield* makeRepo;
			yield* commitAll(root, "init");
			const repo = yield* gitAt(root);
			yield* repo.ensureCleanWorkingTree;

			yield* writeFiles(root, { "new.txt": "x" });
			const error = yield* Effect.flip(repo.ensureCleanWorkingTree);
			assert.strictEqual(error._tag, "WorkingTreeError");
			assert.include(error.message, "not clean");
		}),
	);

	it.effect(
		"runs from the project root even when started in a subdirectory",
		() =>
			Effect.gen(function* () {
				const path = yield* Path.Path;
				const root = yield* makeRepo;
				yield* writeFiles(root, { "sub/file.txt": "x" });
				yield* commitAll(root, "init");
				yield* writeFiles(root, { "other.txt": "x" });

				const repo = yield* gitAt(path.join(root, "sub"));
				assert.isTrue(yield* repo.commitAll("add other"));
				assert.isFalse(yield* repo.commitAll("nothing"));
				assert.strictEqual(
					yield* git(root, "log", "-1", "--format=%s"),
					"add other",
				);
			}),
	);

	it.effect("resolves the tag matching an installed version", () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const root = yield* makeRepo;
			yield* commitAll(root, "init");
			const upstream = path.join(yield* tempDir, "upstream.git");
			yield* gitInit(upstream);
			yield* writeFiles(upstream, { "index.ts": "export {}\n" });
			yield* commitAll(upstream, "init");
			yield* git(upstream, "tag", "lib@1.0.0");
			yield* git(upstream, "tag", "v2.0.0");

			const repo = yield* gitAt(root);
			const resolve = (version: string) =>
				repo.resolveTag({ url: upstream, packageName: "lib", version });
			assert.strictEqual(yield* resolve("1.0.0"), "lib@1.0.0");
			assert.strictEqual(yield* resolve("2.0.0"), "v2.0.0");

			const missing = yield* Effect.flip(resolve("3.0.0"));
			assert.strictEqual(missing._tag, "TagNotFoundError");
			assert.include(missing.message, "pass --ref to override");
		}),
	);

	it.effect("surfaces git's stderr when a command fails", () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const root = yield* makeRepo;
			yield* commitAll(root, "init");
			const repo = yield* gitAt(root);
			const error = yield* Effect.flip(
				repo.resolveTag({
					url: path.join(root, "does-not-exist.git"),
					packageName: "lib",
					version: "1.0.0",
				}),
			);
			assert.strictEqual(error._tag, "GitError");
			assert.include(error.message, "git ls-remote --tags");
			assert.include(error.message, "does-not-exist.git");
		}),
	);
});
