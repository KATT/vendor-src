import { Context, Effect, Layer, Schema, Stream } from "effect";
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

/** The working tree is not in a state vendor-src can safely commit into. */
export class WorkingTreeError extends Schema.TaggedError<WorkingTreeError>()(
	"WorkingTreeError",
	{ reason: Schema.Literals(["NoCommits", "Dirty"]) },
) {
	override get message() {
		return this.reason === "NoCommits"
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

export interface SubtreeOptions {
	/** Project-relative directory, e.g. `repos/effect`. */
	readonly prefix: string;
	readonly url: string;
	readonly ref: string;
}

/** Git operations, always run from the project root. */
export class Git extends Context.Service<
	Git,
	{
		/** Fail unless HEAD exists and there are no uncommitted changes. */
		readonly ensureCleanWorkingTree: Effect.Effect<
			void,
			GitError | WorkingTreeError
		>;
		readonly resolveTag: (options: {
			readonly url: string;
			readonly packageName: string;
			readonly version: string;
		}) => Effect.Effect<string, GitError | TagNotFoundError>;
		readonly subtreeAdd: (
			options: SubtreeOptions,
		) => Effect.Effect<void, GitError>;
		readonly subtreePull: (
			options: SubtreeOptions,
		) => Effect.Effect<void, GitError>;
		/** Stage everything and commit; returns `false` when there was nothing to commit. */
		readonly commitAll: (message: string) => Effect.Effect<boolean, GitError>;
	}
>()("vendor-src/Git") {
	static readonly layer = Layer.effect(
		Git,
		Effect.gen(function* () {
			const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
			const { root } = yield* Project;

			const fromPlatformError =
				(args: ReadonlyArray<string>) =>
				(cause: { readonly message: string }) =>
					new GitError({ args, detail: cause.message });

			/** Run git and return trimmed stdout; stderr becomes the error detail. */
			const capture = (...args: ReadonlyArray<string>) =>
				Effect.gen(function* () {
					const handle = yield* spawner.spawn(
						ChildProcess.make("git", args, { cwd: root }),
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
				}).pipe(
					Effect.scoped,
					Effect.catchTag("PlatformError", (cause) =>
						Effect.fail(fromPlatformError(args)(cause)),
					),
				);

			/** Run git with output streamed to the user's terminal. */
			const inherit = (...args: ReadonlyArray<string>) =>
				spawner
					.exitCode(
						ChildProcess.make("git", args, {
							cwd: root,
							stdout: "inherit",
							stderr: "inherit",
						}),
					)
					.pipe(
						Effect.catchTag("PlatformError", (cause) =>
							Effect.fail(fromPlatformError(args)(cause)),
						),
						Effect.flatMap((exitCode) =>
							exitCode === ChildProcessSpawner.ExitCode(0)
								? Effect.void
								: Effect.fail(
										new GitError({ args, detail: `exit code ${exitCode}` }),
									),
						),
					);

			const ensureCleanWorkingTree = Effect.gen(function* () {
				yield* capture("rev-parse", "--verify", "--quiet", "HEAD").pipe(
					Effect.catchTag("GitError", () =>
						Effect.fail(new WorkingTreeError({ reason: "NoCommits" })),
					),
				);
				const status = yield* capture("status", "--porcelain");
				if (status.length > 0) {
					return yield* new WorkingTreeError({ reason: "Dirty" });
				}
			}).pipe(Effect.withSpan("Git.ensureCleanWorkingTree"));

			const resolveTag = Effect.fn("Git.resolveTag")(function* (options: {
				readonly url: string;
				readonly packageName: string;
				readonly version: string;
			}) {
				const stdout = yield* capture("ls-remote", "--tags", options.url);
				const tag = pickTag(
					parseLsRemoteTags(stdout),
					options.packageName,
					options.version,
				);
				if (tag === undefined) {
					return yield* new TagNotFoundError(options);
				}
				return tag;
			});

			const subtree =
				(command: "add" | "pull") =>
				({ prefix, url, ref }: SubtreeOptions) =>
					inherit(
						"subtree",
						command,
						`--prefix=${prefix}`,
						url,
						toFetchRef(ref),
						"--squash",
					).pipe(Effect.withSpan(`Git.subtree.${command}`));

			const commitAll = Effect.fn("Git.commitAll")(function* (message: string) {
				yield* capture("add", "-A");
				const status = yield* capture("status", "--porcelain");
				if (status.length === 0) {
					return false;
				}
				yield* inherit("commit", "-m", message);
				return true;
			});

			return Git.of({
				ensureCleanWorkingTree,
				resolveTag,
				subtreeAdd: subtree("add"),
				subtreePull: subtree("pull"),
				commitAll,
			});
		}),
	);
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
