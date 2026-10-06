import { Console, Effect, FileSystem, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import { Git } from "../git.ts";
import { repoPrefix, setRepo, vendorDir } from "../manifest.ts";
import { Project, writeProjectFiles } from "../project.ts";
import { pruneIgnoredPaths } from "../prune.ts";
import { defaultVendorName, normalizeRepositoryUrl } from "../repository.ts";
import {
	CommandError,
	ensureNotVendored,
	nameFlag,
	resolveInstalledSource,
	toUserError,
	type PackageSource,
} from "./shared.ts";

const isGitUrl = (target: string) =>
	target.startsWith("http://") ||
	target.startsWith("https://") ||
	target.startsWith("git@") ||
	target.endsWith(".git");

const gitUrlSource = (
	target: string,
	name: Option.Option<string>,
	ref: Option.Option<string>,
) =>
	Option.match(ref, {
		onNone: () =>
			Effect.fail(
				new CommandError({
					message: "when adding a git URL, pass --ref <tag>",
				}),
			),
		onSome: (ref) =>
			Effect.succeed<PackageSource>({
				packageName: Option.getOrElse(name, () =>
					defaultVendorName(
						target
							.replace(/\.git$/, "")
							.split("/")
							.pop() ?? "repo",
					),
				),
				url: normalizeRepositoryUrl(target) ?? target,
				version: ref,
				ref,
			}),
	});

export const addCommand = Command.make(
	"add",
	{
		target: Argument.String("package").pipe(
			Argument.withDescription("npm package name or git URL to vendor"),
		),
		name: nameFlag,
		ref: Flag.String("ref").pipe(
			Flag.withDescription("Git ref/tag to vendor (skips version lookup)"),
			Flag.optional,
		),
		ignore: Flag.String("ignore").pipe(
			Flag.withDescription(
				"Glob matched against paths inside the vendored repo (repeatable)",
			),
			Flag.atLeast(0),
		),
	},
	Effect.fn("add")(function* ({ target, name, ref, ignore }) {
		const fs = yield* FileSystem.FileSystem;
		const project = yield* Project;
		const git = yield* Git;
		yield* git.ensureCleanWorkingTree;

		const source = isGitUrl(target)
			? yield* gitUrlSource(target, name, ref)
			: yield* resolveInstalledSource(target, ref);

		const vendorName = Option.getOrElse(name, () =>
			defaultVendorName(source.packageName),
		);
		const manifest = yield* project.readManifest;
		yield* ensureNotVendored(manifest, vendorName);

		const prefix = repoPrefix(manifest, vendorName);
		if (yield* fs.exists(project.resolve(prefix))) {
			return yield* new CommandError({
				message:
					`${prefix} already exists on disk but is not in vendor-src.json.\n` +
					`Claim it without re-fetching:\n  vendor-src adopt ${source.packageName}\n` +
					`Or remove and re-add:\n  git rm -rq ${prefix} && git commit -m "Remove ${prefix}"\n  vendor-src add ${source.packageName}`,
			});
		}

		yield* Console.log(
			`Vendoring ${source.packageName}@${source.version} as ${prefix} (${source.ref})`,
		);
		yield* git.subtreeAdd({ prefix, url: source.url, ref: source.ref });

		const next = setRepo(manifest, vendorName, {
			package: source.packageName,
			url: source.url,
			version: source.version,
			ref: source.ref,
			ignore,
		});
		yield* pruneIgnoredPaths(next, vendorName);
		yield* writeProjectFiles(next);

		yield* Console.log(
			`Added ${prefix}. Commit vendor-src.json, AGENTS.md, ${vendorDir(next)}/AGENTS.md, and editor ignores.`,
		);
	}, Effect.mapError(toUserError)),
).pipe(
	Command.withDescription(
		"Vendor a dependency's source into the vendor dir at the installed version's git tag",
	),
);
