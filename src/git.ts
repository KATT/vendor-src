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

export const subtreeAdd = (prefix: string, url: string, ref: string) =>
	runInherit("subtree add", [
		"subtree",
		"add",
		`--prefix=${prefix}`,
		url,
		ref,
		"--squash",
	]);

export const subtreePull = (prefix: string, url: string, ref: string) =>
	runInherit("subtree pull", [
		"subtree",
		"pull",
		`--prefix=${prefix}`,
		url,
		ref,
		"--squash",
	]);

export const removePath = (path: string) =>
	runInherit("rm", ["rm", "-rf", path]);
