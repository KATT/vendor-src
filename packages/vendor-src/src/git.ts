import { Context, Effect, Layer, Schema, type Scope, Stream } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { Project } from "./project.ts";
import { parseLsRemoteTags, pickTag } from "./tags.ts";

export class GitError extends Schema.TaggedError<GitError>()("GitError", {
	args: Schema.Array(Schema.String),
	detail: Schema.String,
}) {
	override get message() {
		return `git ${this.args.join(" ")} failed: ${this.detail}`;
	}
}

export class WorkingTreeError extends Schema.TaggedError<WorkingTreeError>()(
	"WorkingTreeError",
	{ reason: Schema.Literals(["no-commits", "dirty"]) },
) {
	override get message() {
		return this.reason === "no-commits"
			? "the repository has no commits yet; make an initial commit first"
			: "working tree is not clean; commit or stash first";
	}
}

export class TagNotFoundError extends Schema.TaggedError<TagNotFoundError>()(
	"TagNotFoundError",
	{
		url: Schema.String,
		packageName: Schema.String,
		version: Schema.String,
	},
) {
	override get message() {
		return `no tag matching ${this.packageName}@${this.version} in ${this.url}; pass --ref to override`;
	}
}

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

export class Git extends Context.Service<
	Git,
	{
		/** Fail unless the repository has a commit and a clean working tree. */
		readonly ensureReady: Effect.Effect<void, GitError | WorkingTreeError>;
		readonly resolveTag: (
			url: string,
			packageName: string,
			version: string,
		) => Effect.Effect<string, GitError | TagNotFoundError>;
		readonly subtreeAdd: (
			prefix: string,
			url: string,
			ref: string,
		) => Effect.Effect<void, GitError>;
		readonly subtreePull: (
			prefix: string,
			url: string,
			ref: string,
		) => Effect.Effect<void, GitError>;
		/** Stage everything and commit; returns `false` when there was nothing to commit. */
		readonly commitAll: (message: string) => Effect.Effect<boolean, GitError>;
	}
>()("vendor-src/Git") {
	static readonly layer = Layer.effect(
		Git,
		Effect.gen(function* () {
			const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
			const project = yield* Project;

			const spawnFailed = <A>(
				effect: Effect.Effect<A, GitError | PlatformError, Scope.Scope>,
				args: ReadonlyArray<string>,
			): Effect.Effect<A, GitError> =>
				effect.pipe(
					Effect.scoped,
					Effect.catchTag("PlatformError", (cause) =>
						Effect.fail(new GitError({ args, detail: cause.message })),
					),
				);

			/** Run git in the project root and return trimmed stdout. */
			const capture = Effect.fnUntraced(function* (
				args: ReadonlyArray<string>,
			) {
				const handle = yield* spawner.spawn(
					ChildProcess.make("git", args, { cwd: project.root }),
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
					return yield* new GitError({
						args,
						detail: stderr.trim() || `exit code ${exitCode}`,
					});
				}
				return stdout.trim();
			}, spawnFailed);

			/** Run git in the project root with output streamed to the terminal. */
			const interactive = Effect.fnUntraced(function* (
				args: ReadonlyArray<string>,
			) {
				const handle = yield* spawner.spawn(
					ChildProcess.make("git", args, {
						cwd: project.root,
						stdout: "inherit",
						stderr: "inherit",
					}),
				);
				const exitCode = yield* handle.exitCode;
				if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
					return yield* new GitError({ args, detail: `exit code ${exitCode}` });
				}
			}, spawnFailed);

			const ensureReady = Effect.gen(function* () {
				yield* capture(["rev-parse", "--verify", "--quiet", "HEAD"]).pipe(
					Effect.catchTag("GitError", () =>
						Effect.fail(new WorkingTreeError({ reason: "no-commits" })),
					),
				);
				const status = yield* capture(["status", "--porcelain"]);
				if (status.length > 0) {
					return yield* new WorkingTreeError({ reason: "dirty" });
				}
			}).pipe(Effect.withSpan("Git.ensureReady"));

			const resolveTag = Effect.fn("Git.resolveTag")(function* (
				url: string,
				packageName: string,
				version: string,
			) {
				const stdout = yield* capture(["ls-remote", "--tags", url]);
				const tag = pickTag(parseLsRemoteTags(stdout), packageName, version);
				if (tag === undefined) {
					return yield* new TagNotFoundError({ url, packageName, version });
				}
				return tag;
			});

			const subtreeAdd = Effect.fn("Git.subtreeAdd")(function* (
				prefix: string,
				url: string,
				ref: string,
			) {
				yield* interactive([
					"subtree",
					"add",
					`--prefix=${prefix}`,
					url,
					toFetchRef(ref),
					"--squash",
				]);
			});

			const subtreePull = Effect.fn("Git.subtreePull")(function* (
				prefix: string,
				url: string,
				ref: string,
			) {
				yield* interactive([
					"subtree",
					"pull",
					`--prefix=${prefix}`,
					url,
					toFetchRef(ref),
					"--squash",
				]);
			});

			const commitAll = Effect.fn("Git.commitAll")(function* (message: string) {
				yield* capture(["add", "-A"]);
				const status = yield* capture(["status", "--porcelain"]);
				if (status.length === 0) {
					return false;
				}
				yield* interactive(["commit", "-m", message]);
				return true;
			});

			return Git.of({
				ensureReady,
				resolveTag,
				subtreeAdd,
				subtreePull,
				commitAll,
			});
		}),
	);
}
