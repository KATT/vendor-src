import { Context, Effect, Layer, Schema, type Scope, Stream } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { Project } from "./project.ts";
import { compareSemver } from "./semver.ts";
import {
	newestMatchingTag,
	parseLsRemoteHead,
	parseLsRemoteTags,
	parseVersionedTag,
	pickTag,
} from "./tags.ts";

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
	{
		reason: Schema.Literals(["no-commits", "dirty"]),
		paths: Schema.optionalKey(Schema.Array(Schema.String)),
	},
) {
	override get message() {
		if (this.reason === "no-commits") {
			return "the repository has no commits yet; make an initial commit first";
		}
		return this.paths === undefined
			? "working tree is not clean; commit or stash first"
			: `uncommitted changes in ${this.paths.join(", ")}; commit, stash, or discard them first`;
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
		return `no tag matching ${this.packageName}@${this.version} in ${this.url}. Pick a tag with \`vendor-src add ${this.packageName} --ref <tag>\`, or vendor a repository that tags its releases with \`vendor-src add <git-url> --ref <tag> --name ${this.packageName}\``;
	}
}

export class UpstreamRefError extends Schema.TaggedError<UpstreamRefError>()(
	"UpstreamRefError",
	{
		url: Schema.String,
		ref: Schema.String,
		reason: Schema.Literals(["unsupported-ref", "no-matching-tags", "no-head"]),
	},
) {
	override get message() {
		switch (this.reason) {
			case "unsupported-ref":
				return `can't tell what a newer version of ${this.ref} is in ${this.url}: git-only checkouts sync from a versioned tag (like v1.2.3 or pkg@1.2.3) or a commit SHA. Remove the checkout and add it again with \`--ref <tag-or-sha>\``;
			case "no-matching-tags":
				return `no tags in ${this.url} look like ${this.ref}`;
			case "no-head":
				return `${this.url} has no default branch HEAD to sync ${this.ref} to`;
		}
	}
}

export const isCommitSha = (ref: string): boolean =>
	/^[0-9a-f]{7,64}$/i.test(ref);

/** Prefer fully-qualified refs so tags like `effect@4.0.1` are not ambiguous. */
export function toFetchRef(ref: string): string {
	if (
		ref.startsWith("refs/") ||
		isCommitSha(ref) ||
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
		/**
		 * Fail unless the repository has a commit and nothing under `paths` is
		 * uncommitted. Changes elsewhere (e.g. a lockfile mid-install) are fine.
		 */
		readonly ensureClean: (
			paths: ReadonlyArray<string>,
		) => Effect.Effect<void, GitError | WorkingTreeError>;
		readonly resolveTag: (
			url: string,
			packageName: string,
			version: string,
		) => Effect.Effect<string, GitError | TagNotFoundError>;
		/**
		 * The newest upstream ref for a git-only checkout: the highest tag
		 * sharing `ref`'s prefix (e.g. `orpc@`), or the default branch's HEAD
		 * when `ref` is a commit SHA. Returns `ref` itself when nothing is newer.
		 */
		readonly latestRef: (
			url: string,
			ref: string,
		) => Effect.Effect<string, GitError | UpstreamRefError>;
		readonly subtreeAdd: (
			prefix: string,
			url: string,
			ref: string,
		) => Effect.Effect<void, GitError>;
		/**
		 * Replace `prefix` with the tree at `ref` from `url` in a new commit that
		 * contains only `prefix`. Local edits under `prefix` are discarded.
		 */
		readonly replaceSubtree: (
			prefix: string,
			url: string,
			ref: string,
		) => Effect.Effect<void, GitError>;
		/**
		 * Commit every change under `prefix` and nothing else; returns `false`
		 * when there was nothing to commit.
		 */
		readonly commitPath: (
			prefix: string,
			message: string,
		) => Effect.Effect<boolean, GitError>;
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

			const ensureCommitted = capture([
				"rev-parse",
				"--verify",
				"--quiet",
				"HEAD",
			]).pipe(
				Effect.catchTag("GitError", () =>
					Effect.fail(new WorkingTreeError({ reason: "no-commits" })),
				),
			);

			const ensureReady = Effect.gen(function* () {
				yield* ensureCommitted;
				const status = yield* capture(["status", "--porcelain"]);
				if (status.length > 0) {
					return yield* new WorkingTreeError({ reason: "dirty" });
				}
			}).pipe(Effect.withSpan("Git.ensureReady"));

			const ensureClean = Effect.fn("Git.ensureClean")(function* (
				paths: ReadonlyArray<string>,
			) {
				yield* ensureCommitted;
				if (paths.length === 0) {
					return;
				}
				const status = yield* capture([
					"status",
					"--porcelain",
					"--",
					...paths,
				]);
				if (status.length > 0) {
					return yield* new WorkingTreeError({ reason: "dirty", paths });
				}
			});

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

			const latestRef = Effect.fn("Git.latestRef")(function* (
				url: string,
				ref: string,
			) {
				if (isCommitSha(ref)) {
					const stdout = yield* capture(["ls-remote", url, "HEAD"]);
					const head = parseLsRemoteHead(stdout);
					if (head === undefined) {
						return yield* new UpstreamRefError({ url, ref, reason: "no-head" });
					}
					return head.startsWith(ref.toLowerCase()) ? ref : head;
				}
				const current = parseVersionedTag(ref);
				if (current === undefined) {
					return yield* new UpstreamRefError({
						url,
						ref,
						reason: "unsupported-ref",
					});
				}
				const stdout = yield* capture(["ls-remote", "--tags", url]);
				const newest = newestMatchingTag(parseLsRemoteTags(stdout), ref);
				if (newest === undefined) {
					return yield* new UpstreamRefError({
						url,
						ref,
						reason: "no-matching-tags",
					});
				}
				return compareSemver(
					parseVersionedTag(newest)!.version,
					current.version,
				) > 0
					? newest
					: ref;
			});

			// Fetch into a private ref instead of reading FETCH_HEAD, which any
			// concurrent `git fetch` (e.g. an editor's auto-fetch) can overwrite.
			const withFetchedCommit = <A>(
				url: string,
				ref: string,
				use: (commit: string) => Effect.Effect<A, GitError>,
			) => {
				const tmpRef = `refs/vendor-src/fetch/${process.pid}-${Date.now()}`;
				return Effect.gen(function* () {
					yield* interactive([
						"fetch",
						"--no-tags",
						"--no-write-fetch-head",
						url,
						`+${toFetchRef(ref)}:${tmpRef}`,
					]);
					const commit = yield* capture(["rev-parse", `${tmpRef}^{commit}`]);
					return yield* use(commit);
				}).pipe(
					Effect.ensuring(
						capture(["update-ref", "-d", tmpRef]).pipe(Effect.ignore),
					),
				);
			};

			const subtreeAdd = Effect.fn("Git.subtreeAdd")(function* (
				prefix: string,
				url: string,
				ref: string,
			) {
				yield* withFetchedCommit(url, ref, (commit) =>
					interactive([
						"subtree",
						"add",
						`--prefix=${prefix}`,
						commit,
						"--squash",
					]),
				);
			});

			// `git subtree pull` needs the add's squash commit reachable under the
			// same prefix, which squash-merged PRs and moved `dir`s both break.
			const replaceSubtree = Effect.fn("Git.replaceSubtree")(function* (
				prefix: string,
				url: string,
				ref: string,
			) {
				yield* withFetchedCommit(url, ref, (commit) =>
					Effect.gen(function* () {
						yield* capture(["rm", "-rq", "--ignore-unmatch", "--", prefix]);
						yield* capture(["read-tree", `--prefix=${prefix}/`, "-u", commit]);
						yield* interactive([
							"commit",
							"-m",
							`chore(vendor): update ${prefix} to ${ref}`,
							"--",
							prefix,
						]);
					}),
				);
			});

			const commitPath = Effect.fn("Git.commitPath")(function* (
				prefix: string,
				message: string,
			) {
				yield* capture(["add", "-A", "--", prefix]);
				const staged = yield* capture([
					"diff",
					"--cached",
					"--name-only",
					"--",
					prefix,
				]);
				if (staged.length === 0) {
					return false;
				}
				yield* interactive(["commit", "-m", message, "--", prefix]);
				return true;
			});

			return Git.of({
				ensureReady,
				ensureClean,
				resolveTag,
				latestRef,
				subtreeAdd,
				replaceSubtree,
				commitPath,
			});
		}),
	);
}
