import { Effect, FileSystem, Path, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

/** Run a fixture command in `cwd`, dying (so the test fails loudly) on a non-zero exit. */
export const run = Effect.fnUntraced(
	function* (cwd: string, command: string, ...args: ReadonlyArray<string>) {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
		const handle = yield* spawner.spawn(
			ChildProcess.make(command, args, { cwd }),
		);
		const [stdout, stderr, exitCode] = yield* Effect.all(
			[
				Stream.mkString(Stream.decodeText(handle.stdout)),
				Stream.mkString(Stream.decodeText(handle.stderr)),
				handle.exitCode,
			],
			{ concurrency: "unbounded" },
		);
		if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
			return yield* Effect.die(
				new Error(`${command} ${args.join(" ")} failed: ${stderr}`),
			);
		}
		return stdout.trim();
	},
	Effect.scoped,
	Effect.orDie,
);

export const git = (cwd: string, ...args: ReadonlyArray<string>) =>
	run(cwd, "git", ...args);

/** `git init` with a local identity so commits work on CI machines without one. */
export const gitInit = Effect.fnUntraced(function* (cwd: string) {
	const fs = yield* FileSystem.FileSystem;
	yield* fs.makeDirectory(cwd, { recursive: true }).pipe(Effect.orDie);
	yield* git(cwd, "init", "--quiet", "--initial-branch=main");
	yield* git(cwd, "config", "user.name", "vendor-src test");
	yield* git(cwd, "config", "user.email", "test@vendor-src.invalid");
	yield* git(cwd, "config", "commit.gpgsign", "false");
	yield* git(cwd, "config", "tag.gpgsign", "false");
});

export const commitAll = (cwd: string, message: string) =>
	git(cwd, "add", "-A").pipe(
		Effect.andThen(git(cwd, "commit", "--quiet", "-m", message)),
	);

/** Write files (creating parent directories), keyed by path relative to `root`. */
export const writeFiles = Effect.fnUntraced(function* (
	root: string,
	files: Readonly<Record<string, string>>,
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	for (const [relativePath, contents] of Object.entries(files)) {
		const file = path.join(root, relativePath);
		yield* fs.makeDirectory(path.dirname(file), { recursive: true });
		yield* fs.writeFileString(file, contents);
	}
}, Effect.orDie);

export const readFile = (root: string, relativePath: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		return yield* fs.readFileString(path.join(root, relativePath));
	}).pipe(Effect.orDie);

export const exists = (root: string, relativePath: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		return yield* fs.exists(path.join(root, relativePath));
	}).pipe(Effect.orDie);

export const tempDir = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	return yield* fs.makeTempDirectoryScoped({ prefix: "vendor-src-test-" });
}).pipe(Effect.orDie);

export const json = (value: unknown) =>
	`${JSON.stringify(value, null, "\t")}\n`;
