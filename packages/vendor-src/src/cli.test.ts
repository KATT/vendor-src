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
	writeFiles,
} from "./testUtils.ts";

isolateGitConfig();

const TestLayer = Layer.merge(NodeServices.layer, TestConsole.layer);

const vendorSrc = (cwd: string, ...args: string[]) =>
	run(args, { version: "0.0.0-test", cwd });

const errorOutput = Effect.map(TestConsole.errorLines, (lines) =>
	lines.map(String).join("\n"),
);

const logOutput = Effect.map(TestConsole.logLines, (lines) =>
	lines.map(String).join("\n"),
);

/** Run `vendor-src init` in `project` and commit the result. */
const initAndCommit = Effect.fnUntraced(function* (
	project: string,
	...args: string[]
) {
	yield* vendorSrc(project, "init", ...args);
	git(project, "add", "-A");
	git(project, "commit", "-qm", "init vendor-src");
});

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

			yield* vendorSrc(cwd, "init");
			assert.include(yield* readFile(project, ".oxfmtrc.json"), '".repos/"');
			assert.include(
				yield* readFile(project, "package.json"),
				'"postinstall": "vendor-src check"',
			);
			assert.include(
				yield* readFile(project, ".repos", "AGENTS.md"),
				"_None yet.",
			);
			git(project, "add", "-A");
			git(project, "commit", "-qm", "init vendor-src");

			yield* vendorSrc(cwd, "add", "lib", "--ignore", "docs/**");

			assert.strictEqual(
				yield* readFile(project, ".repos", "lib", "src", "index.ts"),
				"export const version = 1\n",
			);
			assert.isFalse(yield* exists(project, ".repos", "lib", "docs"));
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
			assert.include(
				yield* logOutput,
				"Commit: vendor-src.json, AGENTS.md, .repos/AGENTS.md",
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
				yield* readFile(project, ".repos", "lib", "src", "index.ts"),
				"export const version = 2\n",
			);
			assert.isFalse(yield* exists(project, ".repos", "lib", "docs"));
			const synced = yield* decodeManifest(
				yield* readFile(project, "vendor-src.json"),
			);
			assert.strictEqual(synced.repos.lib?.version, "1.1.0");
			assert.strictEqual(synced.repos.lib?.ref, "lib@1.1.0");
			git(project, "add", "-A");
			git(project, "commit", "-qm", "sync lib");

			yield* vendorSrc(cwd, "remove", "lib");
			assert.isFalse(yield* exists(project, ".repos", "lib"));
			const removed = yield* decodeManifest(
				yield* readFile(project, "vendor-src.json"),
			);
			assert.deepStrictEqual(removed.repos, {});
		}).pipe(Effect.provide(TestLayer)),
	);

	it.live(
		"syncs after the add commit was squash-merged and dir was moved",
		() =>
			Effect.gen(function* () {
				const path = yield* Path.Path;
				const root = yield* tempDir;
				const upstream = yield* makeUpstream(root, "lib", [
					{
						version: "1.0.0",
						files: {
							"src/index.ts": "export const version = 1\n",
							"src/old.ts": "export const old = true\n",
							"docs/guide.md": "# Guide\n",
						},
					},
					{
						version: "1.1.0",
						files: { "src/index.ts": "export const version = 2\n" },
					},
				]);
				const work = path.join(root, "lib-work");
				git(work, "rm", "-q", "src/old.ts");
				git(work, "commit", "-qm", "drop old.ts");
				git(work, "tag", "-f", "lib@1.1.0");
				git(upstream, "fetch", "-q", "-f", work, "refs/tags/*:refs/tags/*");

				const project = yield* makeProject(path.join(root, "project"));
				yield* installPackage(project, "lib", "1.0.0", upstream);
				yield* initAndCommit(project);
				yield* vendorSrc(project, "add", "lib", "--ignore", "docs/**");
				git(project, "add", "-A");
				git(project, "commit", "-qm", "vendor lib");

				const squashed = git(
					project,
					"commit-tree",
					"HEAD^{tree}",
					"-m",
					"squash merge",
				);
				git(project, "reset", "-q", "--hard", squashed);

				git(project, "mv", ".repos", "vendor");
				const manifest = yield* readFile(project, "vendor-src.json");
				yield* writeFiles(project, {
					"vendor-src.json": manifest.replace(
						'"dir": ".repos"',
						'"dir": "vendor"',
					),
				});
				git(project, "add", "-A");
				git(project, "commit", "-qm", "move vendor dir");

				yield* installPackage(project, "lib", "1.1.0", upstream);
				yield* vendorSrc(project, "sync");

				assert.strictEqual(
					yield* readFile(project, "vendor", "lib", "src", "index.ts"),
					"export const version = 2\n",
				);
				assert.isFalse(
					yield* exists(project, "vendor", "lib", "src", "old.ts"),
				);
				assert.isFalse(yield* exists(project, "vendor", "lib", "docs"));
				const synced = yield* decodeManifest(
					yield* readFile(project, "vendor-src.json"),
				);
				assert.strictEqual(synced.repos.lib?.version, "1.1.0");
			}).pipe(Effect.provide(TestLayer)),
	);

	it.live("adds a package installed only in a workspace package", () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const root = yield* tempDir;
			const upstream = yield* makeUpstream(root, "lib", [
				{ version: "1.0.0", files: { "src/index.ts": "export {}\n" } },
			]);
			const project = yield* makeProject(path.join(root, "project"), {
				"pnpm-workspace.yaml": "packages:\n  - apps/*\n",
				"apps/web/package.json": JSON.stringify({
					dependencies: { lib: "^1.0.0" },
				}),
			});
			yield* installPackage(
				path.join(project, "apps", "web"),
				"lib",
				"1.0.0",
				upstream,
			);
			yield* initAndCommit(project);

			const typo = yield* vendorSrc(project, "add", "lbi").pipe(Effect.flip);
			assert.strictEqual(typo._tag, "UserError");
			const output = yield* errorOutput;
			assert.include(
				output,
				"package lbi is not installed in the project root or any of its 1 workspace packages.",
			);
			assert.include(output, "Did you mean one of these dependencies?");
			assert.include(output, "  lib (apps/web)");

			yield* vendorSrc(project, "add", "lib");
			assert.isTrue(yield* exists(project, ".repos", "lib", "src", "index.ts"));
			const manifest = yield* decodeManifest(
				yield* readFile(project, "vendor-src.json"),
			);
			assert.strictEqual(manifest.repos.lib?.ref, "lib@1.0.0");
		}).pipe(Effect.provide(TestLayer)),
	);

	it.live("renders user errors without a stack trace", () =>
		Effect.gen(function* () {
			const project = yield* makeProject(yield* tempDir);
			yield* installPackage(project, "lib", "1.0.0");
			yield* initAndCommit(project);

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

	it.live("refuses to add over an untracked checkout", () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const root = yield* tempDir;
			const upstream = yield* makeUpstream(root, "lib", [
				{ version: "1.0.0", files: { "src/index.ts": "export {}\n" } },
			]);
			const project = yield* makeProject(path.join(root, "project"), {
				".repos/lib/src/index.ts": "export {}\n",
			});
			yield* installPackage(project, "lib", "1.0.0", upstream);
			yield* initAndCommit(project);

			const error = yield* vendorSrc(project, "add", "lib").pipe(Effect.flip);
			assert.strictEqual(error._tag, "UserError");
			const output = yield* errorOutput;
			assert.include(
				output,
				".repos/lib already exists on disk but is not in vendor-src.json",
			);
			assert.include(output, "git rm -rq .repos/lib");
			assert.include(output, "vendor-src add lib");
		}).pipe(Effect.provide(TestLayer)),
	);

	it.live("asks for init before any command that needs vendor-src.json", () =>
		Effect.gen(function* () {
			const project = yield* makeProject(yield* tempDir);
			yield* installPackage(project, "lib", "1.0.0");
			for (const args of [["add", "lib"], ["sync"], ["check"], ["list"]]) {
				const error = yield* vendorSrc(project, ...args).pipe(Effect.flip);
				assert.strictEqual(error._tag, "UserError");
			}
			const output = yield* errorOutput;
			assert.include(output, "vendor-src.json not found in");
			assert.include(output, "run `vendor-src init` first");
			assert.notInclude(output, "working tree is not clean");
			assert.isFalse(yield* exists(project, "vendor-src.json"));
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

describe("vendor-src init", () => {
	it.live("writes the default setup and is idempotent", () =>
		Effect.gen(function* () {
			const project = yield* makeProject(yield* tempDir, {
				"AGENTS.md": "# Project\n",
			});

			yield* vendorSrc(project, "init");
			const manifest = yield* decodeManifest(
				yield* readFile(project, "vendor-src.json"),
			);
			assert.strictEqual(manifest.dir, ".repos");
			assert.isTrue(manifest.rootAgentsMd);
			assert.deepStrictEqual(manifest.repos, {});
			assert.include(
				yield* readFile(project, "AGENTS.md"),
				"<!-- vendor-src:start -->",
			);
			assert.isTrue(yield* exists(project, ".repos", "AGENTS.md"));
			assert.include(yield* readFile(project, ".oxfmtrc.json"), '".repos/"');
			assert.include(
				yield* readFile(project, ".vscode", "settings.json"),
				'".repos/**": true',
			);
			assert.include(
				yield* readFile(project, "package.json"),
				'"postinstall": "vendor-src check"',
			);
			const first = yield* logOutput;
			assert.include(first, "Created vendor-src.json");
			assert.include(first, "  package.json");
			assert.include(first, "run `vendor-src add <package>`");
			git(project, "add", "-A");
			git(project, "commit", "-qm", "init vendor-src");

			yield* vendorSrc(project, "init");
			assert.include(yield* logOutput, "Already set up; nothing changed.");
			assert.strictEqual(git(project, "status", "--porcelain"), "");
		}).pipe(Effect.provide(TestLayer)),
	);

	it.live("honours --dir and --no-root-agents-md", () =>
		Effect.gen(function* () {
			const project = yield* makeProject(yield* tempDir);

			yield* vendorSrc(
				project,
				"init",
				"--dir",
				"./vendor/",
				"--no-root-agents-md",
			);
			const manifest = yield* decodeManifest(
				yield* readFile(project, "vendor-src.json"),
			);
			assert.strictEqual(manifest.dir, "vendor");
			assert.isFalse(manifest.rootAgentsMd);
			assert.isFalse(yield* exists(project, "AGENTS.md"));
			assert.isTrue(yield* exists(project, "vendor", "AGENTS.md"));
			assert.include(yield* readFile(project, ".oxfmtrc.json"), '"vendor/"');
		}).pipe(Effect.provide(TestLayer)),
	);

	it.live("refuses flags that contradict an existing vendor-src.json", () =>
		Effect.gen(function* () {
			const project = yield* makeProject(yield* tempDir);
			yield* initAndCommit(project);

			const dir = yield* vendorSrc(project, "init", "--dir", "vendor").pipe(
				Effect.flip,
			);
			assert.strictEqual(dir._tag, "UserError");
			const agents = yield* vendorSrc(
				project,
				"init",
				"--no-root-agents-md",
			).pipe(Effect.flip);
			assert.strictEqual(agents._tag, "UserError");

			const output = yield* errorOutput;
			assert.include(output, 'vendor-src.json already sets dir to ".repos"');
			assert.include(
				output,
				"vendor-src.json already sets rootAgentsMd to true",
			);
			assert.strictEqual(git(project, "status", "--porcelain"), "");

			// Matching flags are fine and just re-apply the setup.
			yield* vendorSrc(project, "init", "--dir", ".repos", "--root-agents-md");
		}).pipe(Effect.provide(TestLayer)),
	);

	it.live("rejects a vendor dir outside the project", () =>
		Effect.gen(function* () {
			const project = yield* makeProject(yield* tempDir);
			for (const dir of ["../elsewhere", "/tmp/repos", "."]) {
				const error = yield* vendorSrc(project, "init", "--dir", dir).pipe(
					Effect.flip,
				);
				assert.strictEqual(error._tag, "UserError");
			}
			assert.include(
				yield* errorOutput,
				"--dir must be a relative path inside the project",
			);
			assert.isFalse(yield* exists(project, "vendor-src.json"));
		}).pipe(Effect.provide(TestLayer)),
	);
});
