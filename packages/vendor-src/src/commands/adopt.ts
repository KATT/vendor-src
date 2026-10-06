import { Console, Effect, FileSystem, Option, Path } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import { ensureCleanTree, ensureHasCommits, resolveTag } from "../git.ts";
import {
	readInstalledPackageJson,
	resolveInstalledVersion,
} from "../installedVersions.ts";
import { defaultVendorName, normalizeRepositoryUrl } from "../repository.ts";
import {
	ensurePostinstall,
	findProjectRoot,
	readManifest,
	updateAgentsMd,
	updateEditorIgnores,
	writeManifest,
} from "../project.ts";

/**
 * Register an existing `repos/<name>` checkout in vendor-src.json without
 * running `git subtree add` (for manual subtrees or prior imports).
 */
export const adoptCommand = Command.make(
	"adopt",
	{
		target: Argument.String("package").pipe(
			Argument.withDescription(
				"npm package name to claim under repos/ (directory must already exist)",
			),
		),
		name: Flag.String("name").pipe(
			Flag.withDescription("Directory name under repos/"),
			Flag.optional,
		),
		ref: Flag.String("ref").pipe(
			Flag.withDescription("Git ref/tag to record (skips version/tag lookup)"),
			Flag.optional,
		),
	},
	Effect.fn(function* ({ target, name, ref }) {
		const projectRoot = yield* findProjectRoot;
		yield* ensureHasCommits;
		yield* ensureCleanTree;

		const installed = readInstalledPackageJson(target, projectRoot);
		if (!installed) {
			return yield* Effect.fail(
				new Error(
					`package ${target} is not installed; install it first so vendor-src can pin the matching tag`,
				),
			);
		}

		const packageName = installed.name ?? target;
		const resolvedVersion =
			resolveInstalledVersion(packageName, projectRoot) ?? installed.version;
		const version = resolvedVersion;
		const normalized = normalizeRepositoryUrl(installed.repository);
		if (!normalized) {
			return yield* Effect.fail(
				new Error(
					`package ${packageName} has no repository field; cannot adopt without a git URL`,
				),
			);
		}
		const url = normalized;

		const vendorName = Option.getOrElse(name, () =>
			defaultVendorName(packageName),
		);
		const manifest = yield* readManifest(projectRoot);
		if (manifest.repos[vendorName]) {
			return yield* Effect.fail(
				new Error(
					`repos/${vendorName} is already vendored; use vendor-src sync ${vendorName}`,
				),
			);
		}

		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const prefix = `${manifest.dir}/${vendorName}`;
		const prefixPath = path.join(projectRoot, prefix);
		if (!(yield* fs.exists(prefixPath))) {
			return yield* Effect.fail(
				new Error(
					`${prefix} does not exist. Use vendor-src add ${packageName} to create it, or place a checkout at ${prefix} first.`,
				),
			);
		}

		let gitRef = Option.getOrElse(ref, () => "");
		if (!gitRef) {
			gitRef = yield* resolveTag(url, packageName, version);
		}

		manifest.repos[vendorName] = {
			package: packageName,
			url,
			version,
			ref: gitRef,
		};
		yield* writeManifest(projectRoot, manifest);
		yield* updateAgentsMd(projectRoot, manifest);
		yield* updateEditorIgnores(projectRoot, manifest.dir);
		yield* ensurePostinstall(projectRoot);

		yield* Console.log(
			`Adopted existing ${prefix} as ${packageName}@${version} (${gitRef}). Commit vendor-src.json, AGENTS.md, and editor ignores.`,
		);
	}),
).pipe(
	Command.withDescription(
		"Claim an existing repos/<name> checkout in vendor-src.json without git subtree add",
	),
);
