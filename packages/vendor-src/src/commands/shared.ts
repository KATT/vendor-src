import { Effect, FileSystem, Option, Schema } from "effect";
import { CliError, Flag } from "effect/cli";

import { repoPrefix, type Manifest } from "../manifest.ts";
import { InstalledPackages } from "../packages.ts";
import { Project } from "../project.ts";
import { normalizeRepositoryUrl } from "../repository.ts";

/** A precondition or usage problem reported to the user as-is. */
export class CommandError extends Schema.TaggedError<CommandError>()(
	"CommandError",
	{ message: Schema.String },
) {}

/**
 * Render failures as CLI errors (message only, exit code 1) instead of
 * logging them with a stack trace. Defects are left alone.
 */
export const reportErrors = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
	Effect.mapError(effect, (cause) => new CliError.UserError({ cause }));

export const nameFlag = Flag.String("name").pipe(
	Flag.withDescription("Directory name under the vendor dir"),
	Flag.optional,
);

export const refFlag = Flag.String("ref").pipe(
	Flag.withDescription("Git ref/tag to vendor (skips version/tag lookup)"),
	Flag.optional,
);

export interface InstalledSource {
	readonly packageName: string;
	readonly version: string;
	readonly url: string;
}

/** Resolve the git URL and pinned version for an installed npm package. */
export const resolveInstalledSource = Effect.fn("resolveInstalledSource")(
	function* (target: string) {
		const packages = yield* InstalledPackages;
		const installed = yield* packages.packageJson(target);
		if (Option.isNone(installed)) {
			return yield* new CommandError({
				message: `package ${target} is not installed; install it first so vendor-src can pin the matching tag`,
			});
		}
		const packageName = installed.value.name ?? target;
		const version = Option.getOrElse(
			yield* packages.version(packageName),
			() => installed.value.version,
		);
		const url = normalizeRepositoryUrl(installed.value.repository);
		if (url === undefined) {
			return yield* new CommandError({
				message: `package ${packageName} has no repository field; pass a git URL instead`,
			});
		}
		return { packageName, version, url } satisfies InstalledSource;
	},
);

/** Fail when `name` is already tracked in vendor-src.json. */
export const ensureNotVendored = Effect.fnUntraced(function* (
	manifest: Manifest,
	name: string,
) {
	if (manifest.repos[name] !== undefined) {
		return yield* new CommandError({
			message: `${repoPrefix(manifest, name)} is already vendored; use vendor-src sync ${name}`,
		});
	}
});

/** Whether the checkout directory for `name` exists on disk. */
export const checkoutExists = Effect.fnUntraced(function* (
	manifest: Manifest,
	name: string,
) {
	const fs = yield* FileSystem.FileSystem;
	const project = yield* Project;
	return yield* fs.exists(project.resolve(repoPrefix(manifest, name)));
});

/** Write everything `add` maintains alongside a new checkout. */
export const writeProjectFiles = Effect.fnUntraced(function* (
	manifest: Manifest,
) {
	const project = yield* Project;
	yield* project.writeManifest(manifest);
	yield* project.writeAgentsMd(manifest);
	yield* project.writeEditorIgnores(manifest);
	yield* project.ensurePostinstall;
});
