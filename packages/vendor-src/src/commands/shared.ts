import { Effect, FileSystem, Option, Schema } from "effect";
import { CliError, Flag } from "effect/cli";

import { findVendoredPackage, repoPrefix, type Manifest } from "../manifest.ts";
import { InstalledPackages, suggestPackages } from "../packages.ts";
import { Project } from "../project.ts";
import {
	normalizeRepositoryUrl,
	repositoryDirectory,
	repositoryName,
	repositorySlug,
} from "../repository.ts";
import { unscopedName } from "../tags.ts";

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
	/** Path of the package inside its repo (monorepos), from `repository.directory`. */
	readonly directory?: string | undefined;
}

/** Resolve the git URL and pinned version for an installed npm package. */
export const resolveInstalledSource = Effect.fn("resolveInstalledSource")(
	function* (target: string) {
		const packages = yield* InstalledPackages;
		const installed = yield* packages.packageJson(target);
		if (Option.isNone(installed)) {
			const workspacePackages = (yield* packages.workspaceRoots).length - 1;
			const where =
				workspacePackages > 0
					? `the project root or any of its ${workspacePackages} workspace packages`
					: "the project";
			// Only same-scope packages can come from a repo named like `@scope/repo`;
			// skip resolving the rest to keep this cheap in large workspaces.
			const scope = target.startsWith("@") ? target.split("/")[0] : undefined;
			const declared = yield* Effect.forEach(
				yield* packages.declaredDependencies,
				Effect.fnUntraced(function* (dependency) {
					if (scope === undefined || !dependency.name.startsWith(`${scope}/`)) {
						return dependency;
					}
					const pkg = yield* packages.packageJson(dependency.name);
					const repository = Option.isSome(pkg)
						? normalizeRepositoryUrl(pkg.value.repository)
						: undefined;
					return repository === undefined
						? dependency
						: { ...dependency, repository };
				}),
			);
			const wantedRepo = unscopedName(target).toLowerCase();
			const suggestions = suggestPackages(target, declared);
			const lines = [`package ${target} is not installed in ${where}.`];
			if (suggestions.length > 0) {
				lines.push(
					"Did you mean one of these dependencies?",
					...suggestions.map(({ name, declaredIn, repository }) => {
						const from =
							repository !== undefined &&
							repositoryName(repository).toLowerCase() === wantedRepo
								? `from ${repositorySlug(repository)}; `
								: "";
						return `  ${name} (${from}${declaredIn.join(", ")})`;
					}),
				);
			}
			lines.push(
				"Otherwise install it first so vendor-src can pin the matching tag.",
			);
			return yield* new CommandError({ message: lines.join("\n") });
		}
		const packageName = installed.value.name ?? target;
		const version = installed.value.version;
		const url = normalizeRepositoryUrl(installed.value.repository);
		if (url === undefined) {
			return yield* new CommandError({
				message: `package ${packageName} has no repository field; pass a git URL instead`,
			});
		}
		return {
			packageName,
			version,
			url,
			directory: repositoryDirectory(installed.value.repository),
		} satisfies InstalledSource;
	},
);

/** Fail when `packageName` is already vendored, as a pin or a sibling. */
export const ensurePackageNotVendored = Effect.fnUntraced(function* (
	manifest: Manifest,
	packageName: string,
) {
	const found = findVendoredPackage(manifest, packageName);
	if (found === undefined) {
		return;
	}
	const prefix = repoPrefix(manifest, found.name);
	return yield* new CommandError({
		message:
			found.role === "pin"
				? `${packageName} is already vendored at ${prefix}; use vendor-src sync ${found.name}`
				: `${packageName} is already vendored in ${prefix} (pinned by ${found.repo.package}@${found.repo.version})`,
	});
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
