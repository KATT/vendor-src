import { Console, Effect, FileSystem, Option, Path } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import {
	ensureCleanTree,
	ensureHasCommits,
	resolveTag,
	subtreeAdd,
} from "../git.ts";
import {
	readInstalledPackageJson,
	resolveInstalledVersion,
} from "../installedVersions.ts";
import { pruneIgnoredPaths } from "../prune.ts";
import { defaultVendorName, normalizeRepositoryUrl } from "../repository.ts";
import {
	ensurePostinstall,
	findProjectRoot,
	readManifest,
	updateAgentsMd,
	updateEditorIgnores,
	writeManifest,
} from "../project.ts";

export const addCommand = Command.make(
	"add",
	{
		target: Argument.String("package").pipe(
			Argument.withDescription("npm package name or git URL to vendor"),
		),
		name: Flag.String("name").pipe(
			Flag.withDescription("Directory name under repos/"),
			Flag.optional,
		),
		ref: Flag.String("ref").pipe(
			Flag.withDescription("Git ref/tag to vendor (skips version lookup)"),
			Flag.optional,
		),
		ignore: Flag.String("ignore").pipe(
			Flag.withDescription(
				"Regex matched against paths inside the vendored repo (repeatable)",
			),
			Flag.atLeast(0),
		),
	},
	Effect.fn(function* ({ target, name, ref, ignore }) {
		const projectRoot = yield* findProjectRoot;
		yield* ensureHasCommits;
		yield* ensureCleanTree;

		const isGitUrl =
			target.startsWith("http://") ||
			target.startsWith("https://") ||
			target.startsWith("git@") ||
			target.endsWith(".git");

		let packageName = target;
		let url: string;
		let version: string;
		let gitRef: string;

		if (isGitUrl) {
			url = normalizeRepositoryUrl(target) ?? target;
			const explicitRef = Option.getOrUndefined(ref);
			if (!explicitRef) {
				return yield* Effect.fail(
					new Error("when adding a git URL, pass --ref <tag>"),
				);
			}
			gitRef = explicitRef;
			version = explicitRef;
			packageName = Option.getOrElse(name, () =>
				defaultVendorName(
					target
						.replace(/\.git$/, "")
						.split("/")
						.pop() ?? "repo",
				),
			);
		} else {
			const installed = readInstalledPackageJson(target, projectRoot);
			if (!installed) {
				return yield* Effect.fail(
					new Error(
						`package ${target} is not installed; install it first so vendor-src can pin the matching tag`,
					),
				);
			}
			packageName = installed.name ?? target;
			const resolvedVersion =
				resolveInstalledVersion(packageName, projectRoot) ?? installed.version;
			version = resolvedVersion;
			const normalized = normalizeRepositoryUrl(installed.repository);
			if (!normalized) {
				return yield* Effect.fail(
					new Error(
						`package ${packageName} has no repository field; pass a git URL instead`,
					),
				);
			}
			url = normalized;
			gitRef = Option.getOrElse(ref, () => "");
			if (!gitRef) {
				gitRef = yield* resolveTag(url, packageName, version);
			}
		}

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
		if (yield* fs.exists(prefixPath)) {
			return yield* Effect.fail(
				new Error(
					`${prefix} already exists on disk but is not in vendor-src.json. Remove it first:\n  git rm -rq ${prefix} && git commit -m "Remove ${prefix}"\nThen re-run: vendor-src add ${packageName}`,
				),
			);
		}

		const cliIgnore = ignore as ReadonlyArray<string>;
		yield* Console.log(
			`Vendoring ${packageName}@${version} as ${prefix} (${gitRef})`,
		);
		yield* subtreeAdd(prefix, url, gitRef);

		manifest.repos[vendorName] = {
			package: packageName,
			url,
			version,
			ref: gitRef,
			...(cliIgnore.length > 0 ? { ignore: [...cliIgnore] } : {}),
		};
		yield* pruneIgnoredPaths({
			projectRoot,
			vendorName,
			manifest,
			cliIgnore,
		});
		yield* writeManifest(projectRoot, manifest);
		yield* updateAgentsMd(projectRoot, manifest);
		yield* updateEditorIgnores(projectRoot, manifest.dir);
		yield* ensurePostinstall(projectRoot);

		yield* Console.log(
			`Added ${prefix}. Commit ${"vendor-src.json"}, AGENTS.md, and editor ignores.`,
		);
	}),
).pipe(
	Command.withDescription(
		"Vendor a dependency's source into repos/ at the installed version's git tag",
	),
);
