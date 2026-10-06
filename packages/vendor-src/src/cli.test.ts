import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Path } from "effect";
import { TestConsole } from "effect/testing";

import { run } from "./cli.ts";
import { decodeManifest } from "./manifest.ts";
import {
	exists,
	git,
	installPackage,
	isolateGitConfig,
	makeProject,
	makeUpstream,
	readFile,
	tempDir,
} from "./testUtils.ts";

isolateGitConfig();

const TestLayer = Layer.merge(NodeServices.layer, TestConsole.layer);

const vendorSrc = (cwd: string, ...args: string[]) =>
	run(args, { version: "0.0.0-test", cwd });

const errorOutput = Effect.map(TestConsole.errorLines, (lines) =>
	lines.map(String).join("\n"),
);

describe("vendor-src CLI", () => {
	it.live("adds, checks, syncs, and removes a vendored package", () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const root = yield* tempDir;
			const upstream = yield* makeUpstream(root, "lib", [
				{
					version: "1.0.0",
					files: {
						"src/index.ts": "export const version = 1\n",
						"docs/guide.md": "# Guide\n",
					},
				},
				{
					version: "1.1.0",
					files: { "src/index.ts": "export const version = 2\n" },
				},
			]);
			const project = yield* makeProject(path.join(root, "project"), {
				"src/main.ts": "export {}\n",
			});
			yield* installPackage(project, "lib", "1.0.0", upstream);
			// Run from a subdirectory: git and file paths must use the project root.
			const cwd = path.join(project, "src");

			yield* vendorSrc(cwd, "add", "lib", "--ignore", "docs/**");

			assert.strictEqual(
				yield* readFile(project, "repos", "lib", "src", "index.ts"),
				"export const version = 1\n",
			);
			assert.isFalse(yield* exists(project, "repos", "lib", "docs"));
			const added = yield* decodeManifest(
				yield* readFile(project, "vendor-src.json"),
			);
			assert.deepStrictEqual(added.repos, {
				lib: {
					package: "lib",
					url: upstream,
					version: "1.0.0",
					ref: "lib@1.0.0",
					ignore: ["docs/**"],
				},
			});
			assert.include(yield* readFile(project, "AGENTS.md"), "`lib@1.0.0`");
			assert.include(yield* readFile(project, ".oxfmtrc.json"), "repos/");
			assert.include(
				yield* readFile(project, "package.json"),
				'"postinstall": "vendor-src check"',
			);
			assert.include(
				git(project, "log", "--format=%s"),
				"chore(vendor): prune ignored paths from lib",
			);
			git(project, "add", "-A");
			git(project, "commit", "-qm", "vendor lib");

			yield* vendorSrc(cwd, "check", "--strict");

			yield* installPackage(project, "lib", "1.1.0", upstream);
			const drift = yield* vendorSrc(cwd, "check", "--strict").pipe(
				Effect.flip,
			);
			assert.strictEqual(drift._tag, "UserError");
			const output = yield* errorOutput;
			assert.include(
				output,
				"lib is vendored at 1.0.0 but lib@1.1.0 is installed",
			);
			assert.include(output, "vendored sources are out of date");

			yield* vendorSrc(cwd, "sync");
			assert.strictEqual(
				yield* readFile(project, "repos", "lib", "src", "index.ts"),
				"export const version = 2\n",
			);
			assert.isFalse(yield* exists(project, "repos", "lib", "docs"));
			const synced = yield* decodeManifest(
				yield* readFile(project, "vendor-src.json"),
			);
			assert.strictEqual(synced.repos.lib?.version, "1.1.0");
			assert.strictEqual(synced.repos.lib?.ref, "lib@1.1.0");
			git(project, "add", "-A");
			git(project, "commit", "-qm", "sync lib");

			yield* vendorSrc(cwd, "remove", "lib");
			assert.isFalse(yield* exists(project, "repos", "lib"));
			const removed = yield* decodeManifest(
				yield* readFile(project, "vendor-src.json"),
			);
			assert.deepStrictEqual(removed.repos, {});
		}).pipe(Effect.provide(TestLayer)),
	);

	it.live("renders user errors without a stack trace", () =>
		Effect.gen(function* () {
			const project = yield* makeProject(yield* tempDir);
			yield* installPackage(project, "lib", "1.0.0");

			const noRepo = yield* vendorSrc(project, "add", "lib").pipe(Effect.flip);
			assert.strictEqual(noRepo._tag, "UserError");
			const output = yield* errorOutput;
			assert.include(output, "package lib has no repository field");
			assert.notInclude(output, "    at ");

			const unknown = yield* vendorSrc(project, "sync", "nope").pipe(
				Effect.flip,
			);
			assert.strictEqual(unknown._tag, "UserError");
			assert.include(yield* errorOutput, "no vendored repository named nope");
		}).pipe(Effect.provide(TestLayer)),
	);

	it.live("fails outside a project only when a subcommand runs", () =>
		Effect.gen(function* () {
			const dir = yield* tempDir;
			yield* vendorSrc(dir, "--help");
			const error = yield* vendorSrc(dir, "list").pipe(Effect.flip);
			assert.strictEqual(error._tag, "UserError");
			assert.include(
				yield* errorOutput,
				"is not inside a git repository with a package.json",
			);
		}).pipe(Effect.provide(TestLayer)),
	);
});
