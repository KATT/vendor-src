import { Effect, Option, Schema } from "effect";
import { CliError, Flag } from "effect/cli";

import { Git } from "../git.ts";
import { InstalledPackages } from "../installedPackages.ts";
import { repoPrefix, type Manifest } from "../manifest.ts";
import { normalizeRepositoryUrl } from "../repository.ts";

/** A command precondition the user has to fix. */
export class CommandError extends Schema.TaggedError<CommandError>()(
	"CommandError",
	{ message: Schema.String },
) {}

/** Let the CLI render failures as a plain message instead of a stack trace. */
export const toUserError = (cause: unknown) =>
	new CliError.UserError({ cause });

export const nameFlag = Flag.String("name").pipe(
	Flag.withDescription(
		"Directory name under the vendor dir (defaults to the unscoped package name)",
	),
	Flag.optional,
);

export interface PackageSource {
	readonly packageName: string;
	readonly url: string;
	readonly version: string;
	readonly ref: string;
}

/** Where to fetch an installed npm package's source, pinned to its installed version. */
export const resolveInstalledSource = Effect.fn("resolveInstalledSource")(
	function* (target: string, ref: Option.Option<string>) {
		const packages = yield* InstalledPackages;
		const git = yield* Git;

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
				message: `package ${packageName} has no "repository" field; vendor it by git URL instead (vendor-src add <url> --ref <tag>)`,
			});
		}
		const gitRef = Option.isSome(ref)
			? ref.value
			: yield* git.resolveTag({ url, packageName, version });
		return { packageName, url, version, ref: gitRef } satisfies PackageSource;
	},
);

export const ensureNotVendored = (manifest: Manifest, name: string) =>
	manifest.repos[name] === undefined
		? Effect.void
		: Effect.fail(
				new CommandError({
					message: `${repoPrefix(manifest, name)} is already vendored; use vendor-src sync ${name}`,
				}),
			);
