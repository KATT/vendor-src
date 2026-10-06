import { assert, layer } from "@effect/vitest";
import { NodeServices } from "@effect/platform-node";
import { Effect, Path } from "effect";
import { Command } from "effect/cli";
import { TestConsole } from "effect/testing";

import { cli } from "./cli.ts";
import {
	commitAll,
	exists,
	git,
	gitInit,
	json,
	readFile,
	tempDir,
	writeFiles,
} from "./testing.ts";

const runCli = (cwd: string, ...args: ReadonlyArray<string>) =>
	Command.runWith(cli(cwd), { version: "0.0.0-test" })(args);

const output = Effect.gen(function* () {
	const lines = [
		...(yield* TestConsole.logLines),
		...(yield* TestConsole.errorLines),
	];
	return lines.map(String).join("\n");
});

/** Runs the CLI and returns only the console output it produced. */
const runCliOutput = Effect.fnUntraced(function* (
	cwd: string,
	...args: ReadonlyArray<string>
) {
	const logs = (yield* TestConsole.logLines).length;
	const errors = (yield* TestConsole.errorLines).length;
	yield* runCli(cwd, ...args);
	return [
		...(yield* TestConsole.logLines).slice(logs),
		...(yield* TestConsole.errorLines).slice(errors),
	]
		.map(String)
		.join("\n");
});

const installedPackageJson = (version: string, upstream: string) =>
	json({
		name: "fake-lib",
		version,
		repository: { type: "git", url: upstream },
		exports: { ".": "./index.js" },
	});

/** An upstream git repo tagged `fake-lib@1.0.0`, and a project with it "installed". */
const makeFixture = Effect.gen(function* () {
	const path = yield* Path.Path;
	const tmp = yield* tempDir;

	const upstream = path.join(tmp, "fake-lib.git");
	yield* gitInit(upstream);
	yield* writeFiles(upstream, {
		"README.md": "# fake-lib\n",
		"src/index.ts": "export const version = 1;\n",
		"docs/guide.md": "guide\n",
	});
	yield* commitAll(upstream, "v1");
	yield* git(upstream, "tag", "fake-lib@1.0.0");

	const project = path.join(tmp, "app");
	yield* gitInit(project);
	yield* writeFiles(project, {
		".gitignore": "node_modules/\n",
		"package.json": json({ name: "app", private: true }),
		"node_modules/fake-lib/package.json": installedPackageJson(
			"1.0.0",
			upstream,
		),
	});
	yield* commitAll(project, "init");

	/** Tag a new upstream release and "install" it in the project. */
	const release = Effect.fnUntraced(function* (
		version: string,
		files: Readonly<Record<string, string>>,
	) {
		yield* writeFiles(upstream, files);
		yield* commitAll(upstream, `v${version}`);
		yield* git(upstream, "tag", `fake-lib@${version}`);
		yield* writeFiles(project, {
			"node_modules/fake-lib/package.json": installedPackageJson(
				version,
				upstream,
			),
		});
	});

	return { project, upstream, release };
});

layer(NodeServices.layer, { timeout: 60_000 })("vendor-src CLI", (it) => {
	it.effect("add → check → sync → list → remove", () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const { project, upstream, release } = yield* makeFixture;

			// Run from a subdirectory to make sure everything resolves from the root.
			yield* writeFiles(project, { "src/main.ts": "export {}\n" });
			yield* commitAll(project, "src");
			yield* runCli(
				path.join(project, "src"),
				"add",
				"fake-lib",
				"--ignore",
				"docs/**",
			);

			assert.include(
				yield* output,
				"Vendoring fake-lib@1.0.0 as repos/fake-lib (fake-lib@1.0.0)",
			);
			assert.strictEqual(
				yield* readFile(project, "repos/fake-lib/src/index.ts"),
				"export const version = 1;\n",
			);
			assert.isFalse(yield* exists(project, "repos/fake-lib/docs"));
			assert.isFalse(yield* exists(project, "src/repos"));
			assert.deepStrictEqual(
				JSON.parse(yield* readFile(project, "vendor-src.json")).repos,
				{
					"fake-lib": {
						package: "fake-lib",
						url: upstream,
						version: "1.0.0",
						ref: "fake-lib@1.0.0",
						ignore: ["docs/**"],
					},
				},
			);
			assert.include(
				yield* readFile(project, "AGENTS.md"),
				"- `fake-lib@1.0.0` → `repos/fake-lib`",
			);
			assert.isTrue(yield* exists(project, "repos/AGENTS.md"));
			assert.isTrue(yield* exists(project, ".oxfmtrc.json"));
			assert.isTrue(yield* exists(project, ".vscode/settings.json"));
			assert.strictEqual(
				JSON.parse(yield* readFile(project, "package.json")).scripts
					.postinstall,
				"vendor-src check",
			);
			assert.strictEqual(
				yield* git(project, "log", "-1", "--format=%s"),
				"chore(vendor): prune ignored paths from fake-lib",
			);
			yield* commitAll(project, "vendor fake-lib");

			yield* runCli(project, "check", "--strict");

			yield* release("1.1.0", {
				"src/index.ts": "export const version = 2;\n",
				"docs/new.md": "new\n",
			});

			assert.include(
				yield* runCliOutput(project, "check"),
				"vendor-src: fake-lib is vendored at 1.0.0 but fake-lib@1.1.0 is installed",
			);

			const stale = yield* Effect.flip(runCli(project, "check", "--strict"));
			assert.strictEqual(stale.message, "vendored sources are out of date");

			yield* runCli(project, "sync");
			assert.strictEqual(
				yield* readFile(project, "repos/fake-lib/src/index.ts"),
				"export const version = 2;\n",
			);
			assert.isFalse(yield* exists(project, "repos/fake-lib/docs"));
			const synced = JSON.parse(yield* readFile(project, "vendor-src.json"));
			assert.strictEqual(synced.repos["fake-lib"].version, "1.1.0");
			assert.strictEqual(synced.repos["fake-lib"].ref, "fake-lib@1.1.0");
			yield* commitAll(project, "sync fake-lib");

			assert.include(
				yield* runCliOutput(project, "list"),
				"fake-lib\tfake-lib@1.1.0\tfake-lib@1.1.0\tok",
			);

			yield* runCli(project, "remove", "fake-lib");
			assert.isFalse(yield* exists(project, "repos/fake-lib"));
			assert.deepStrictEqual(
				JSON.parse(yield* readFile(project, "vendor-src.json")).repos,
				{},
			);
		}),
	);

	it.effect("adopt registers an existing checkout without fetching", () =>
		Effect.gen(function* () {
			const { project } = yield* makeFixture;
			yield* writeFiles(project, { "repos/fake-lib/README.md": "manual\n" });
			yield* commitAll(project, "manual subtree");

			yield* runCli(project, "adopt", "fake-lib");

			assert.strictEqual(
				yield* readFile(project, "repos/fake-lib/README.md"),
				"manual\n",
			);
			assert.strictEqual(
				JSON.parse(yield* readFile(project, "vendor-src.json")).repos[
					"fake-lib"
				].ref,
				"fake-lib@1.0.0",
			);
		}),
	);

	it.effect("reports user errors as plain messages", () =>
		Effect.gen(function* () {
			const { project } = yield* makeFixture;
			const failure = (...args: ReadonlyArray<string>) =>
				Effect.flip(runCli(project, ...args)).pipe(
					Effect.map((error) => error.message),
				);

			assert.strictEqual(
				yield* failure("add", "not-installed"),
				"package not-installed is not installed; install it first so vendor-src can pin the matching tag",
			);
			assert.strictEqual(
				yield* failure("add", "https://example.com/lib.git"),
				"when adding a git URL, pass --ref <tag>",
			);
			assert.strictEqual(
				yield* failure("adopt", "fake-lib"),
				"repos/fake-lib does not exist. Use vendor-src add fake-lib to create it, or place a checkout at repos/fake-lib first.",
			);
			assert.strictEqual(
				yield* failure("sync", "nope"),
				"no vendored repository named nope",
			);

			yield* writeFiles(project, { "dirty.txt": "x" });
			assert.strictEqual(
				yield* failure("add", "fake-lib"),
				"working tree is not clean; commit or stash first",
			);
			assert.include(yield* output, "ERROR");
		}),
	);

	it.effect("fails cleanly outside a project", () =>
		Effect.gen(function* () {
			const dir = yield* tempDir;
			const error = yield* Effect.flip(runCli(dir, "list"));
			assert.include(error.message, "is not inside a git repository");
		}),
	);
});
