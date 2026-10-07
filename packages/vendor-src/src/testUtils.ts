import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect, FileSystem, Path } from "effect";

/** Point git at a throwaway global config so tests never depend on the host's. */
export function isolateGitConfig(): void {
	const file = join(
		mkdtempSync(join(tmpdir(), "vendor-src-gitconfig-")),
		"config",
	);
	writeFileSync(
		file,
		[
			"[user]",
			"\tname = vendor-src tests",
			"\temail = tests@vendor-src.invalid",
			"[init]",
			"\tdefaultBranch = main",
			"[commit]",
			"\tgpgsign = false",
			"[tag]",
			"\tgpgsign = false",
			"",
		].join("\n"),
	);
	process.env.GIT_CONFIG_GLOBAL = file;
	process.env.GIT_CONFIG_NOSYSTEM = "1";
}

export const git = (cwd: string, ...args: string[]): string =>
	execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

/** A scoped temp directory with symlinks resolved (macOS `/var` → `/private/var`). */
export const tempDir = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	return yield* fs.realPath(
		yield* fs.makeTempDirectoryScoped({ prefix: "vendor-src-test-" }),
	);
});

/** Write files relative to `root`, creating parent directories. */
export const writeFiles = Effect.fnUntraced(function* (
	root: string,
	files: Record<string, string>,
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	for (const [file, contents] of Object.entries(files)) {
		yield* fs.makeDirectory(path.dirname(path.join(root, file)), {
			recursive: true,
		});
		yield* fs.writeFileString(path.join(root, file), contents);
	}
});

export const readFile = Effect.fnUntraced(function* (...segments: string[]) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	return yield* fs.readFileString(path.join(...segments));
});

export const exists = Effect.fnUntraced(function* (...segments: string[]) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	return yield* fs.exists(path.join(...segments));
});

/** A git repository with a package.json and one commit. */
export const makeProject = Effect.fnUntraced(function* (
	root: string,
	files: Record<string, string> = {},
) {
	yield* writeFiles(root, {
		"package.json": `${JSON.stringify({ name: "fixture", private: true }, null, "\t")}\n`,
		".gitignore": "node_modules/\n",
		...files,
	});
	git(root, "init", "-q");
	git(root, "add", "-A");
	git(root, "commit", "-qm", "init");
	return root;
});

/**
 * A bare "upstream" repository at `<root>/<name>.git` with one tag per
 * version, tagged `<name>@<version>` the way Effect tags its releases.
 */
export const makeUpstream = Effect.fnUntraced(function* (
	root: string,
	name: string,
	releases: ReadonlyArray<{
		readonly version: string;
		readonly files: Record<string, string>;
	}>,
) {
	const path = yield* Path.Path;
	const work = path.join(root, `${name}-work`);
	const bare = path.join(root, `${name}.git`);
	yield* writeFiles(work, { "README.md": `# ${name}\n` });
	git(work, "init", "-q");
	for (const release of releases) {
		yield* writeFiles(work, release.files);
		git(work, "add", "-A");
		git(work, "commit", "-qm", `release ${release.version}`);
		git(work, "tag", `${name}@${release.version}`);
	}
	git(root, "clone", "-q", "--bare", work, bare);
	return bare;
});

/** Simulate `npm install` of `name@version` under `<dir>/node_modules`. */
export const installPackage = (
	dir: string,
	name: string,
	version: string,
	repository?: string | { readonly url: string; readonly directory?: string },
) =>
	writeFiles(dir, {
		[`node_modules/${name}/package.json`]: JSON.stringify({
			name,
			version,
			...(repository ? { repository } : {}),
			// Packages often hide package.json behind `exports`.
			exports: { ".": "./index.js" },
		}),
	});
