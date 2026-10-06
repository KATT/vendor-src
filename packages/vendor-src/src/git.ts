import { rmSync } from "node:fs";

import { Effect, String as EffectString } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { parseLsRemoteTags, pickTag } from "./tags.ts";

export class GitError extends Error {
	readonly _tag = "GitError";
	constructor(
		readonly command: string,
		readonly detail: string,
	) {
		super(`git ${command} failed: ${detail}`);
		this.name = "GitError";
	}
}

const runString = (label: string, args: string[]) =>
	Effect.gen(function* () {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
		return yield* spawner.string(ChildProcess.make("git", args)).pipe(
			Effect.map(EffectString.trim),
			Effect.mapError((cause) => new GitError(label, String(cause))),
		);
	});

const runInherit = (label: string, args: string[]) =>
	Effect.gen(function* () {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
		const handle = yield* spawner.spawn(
			ChildProcess.make("git", args, {
				stdout: "inherit",
				stderr: "inherit",
			}),
		);
		const exitCode = yield* handle.exitCode;
		if (Number(exitCode) !== 0) {
			return yield* Effect.fail(
				new GitError(label, `exit ${String(exitCode)}`),
			);
		}
	}).pipe(Effect.scoped);

export const ensureCleanTree = Effect.gen(function* () {
	const status = yield* runString("status", ["status", "--porcelain"]);
	if (status.length > 0) {
		return yield* Effect.fail(
			new GitError(
				"status",
				"working tree is not clean; commit or stash first",
			),
		);
	}
});

export const ensureHasCommits = runString("rev-parse", [
	"rev-parse",
	"HEAD",
]).pipe(Effect.asVoid);

export const listRemoteTags = (url: string) =>
	runString("ls-remote", ["ls-remote", "--tags", url]).pipe(
		Effect.map(parseLsRemoteTags),
	);

export const resolveTag = (url: string, packageName: string, version: string) =>
	Effect.gen(function* () {
		const tags = yield* listRemoteTags(url);
		const tag = pickTag(tags, packageName, version);
		if (!tag) {
			return yield* Effect.fail(
				new GitError(
					"ls-remote",
					`no tag matching ${packageName}@${version} in ${url}; pass --ref to override`,
				),
			);
		}
		return tag;
	});

/** Prefer fully-qualified refs so tags like `effect@4.0.1` are not ambiguous. */
export function toFetchRef(ref: string): string {
	if (
		ref.startsWith("refs/") ||
		/^[0-9a-f]{7,40}$/i.test(ref) ||
		ref.startsWith("origin/")
	) {
		return ref;
	}
	return `refs/tags/${ref}`;
}

export const subtreeAdd = (prefix: string, url: string, ref: string) =>
	runInherit("subtree add", [
		"subtree",
		"add",
		`--prefix=${prefix}`,
		url,
		toFetchRef(ref),
		"--squash",
	]);

export const subtreePull = (prefix: string, url: string, ref: string) =>
	runInherit("subtree pull", [
		"subtree",
		"pull",
		`--prefix=${prefix}`,
		url,
		toFetchRef(ref),
		"--squash",
	]);

/**
 * Delete a path from the working tree. Prefer filesystem remove so untracked
 * matches (e.g. `.DS_Store`) do not fail `git rm`; `commitAll` stages tracked
 * deletions via `git add -A`.
 */
export const removePath = (path: string) =>
	Effect.sync(() => {
		rmSync(path, { recursive: true, force: true });
	});

export const removePaths = (paths: readonly string[]) =>
	Effect.gen(function* () {
		for (const path of paths) {
			yield* removePath(path);
		}
	});

export const commitAll = (message: string) =>
	Effect.gen(function* () {
		yield* runString("add", ["add", "-A"]);
		const status = yield* runString("status", ["status", "--porcelain"]);
		if (status.length === 0) {
			return false;
		}
		yield* runInherit("commit", ["commit", "-m", message]);
		return true;
	});
