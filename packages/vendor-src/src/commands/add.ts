import { Console, Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import { Git } from "../git.ts";
import { repoPrefix, setRepo, vendorDir } from "../manifest.ts";
import { Project } from "../project.ts";
import { pruneIgnoredPaths } from "../prune.ts";
import { defaultVendorName, normalizeRepositoryUrl } from "../repository.ts";
import {
	checkoutExists,
	CommandError,
	ensureNotVendored,
	nameFlag,
	refFlag,
	reportErrors,
	resolveInstalledSource,
	writeProjectFiles,
} from "./shared.ts";

const isGitUrl = (target: string) =>
	target.startsWith("http://") ||
	target.startsWith("https://") ||
	target.startsWith("git@") ||
	target.endsWith(".git");

export const addCommand = Command.make(
	"add",
	{
		target: Argument.String("package").pipe(
			Argument.withDescription("npm package name or git URL to vendor"),
		),
		name: nameFlag,
		ref: refFlag,
		ignore: Flag.String("ignore").pipe(
			Flag.withDescription(
				"Glob matched against paths inside the vendored repo (repeatable)",
			),
			Flag.atLeast(0),
		),
	},
	Effect.fn("vendor-src add")(function* ({ target, name, ref, ignore }) {
		const project = yield* Project;
		const git = yield* Git;
		yield* git.ensureReady;

		const source = isGitUrl(target)
			? {
					packageName: Option.getOrElse(name, () =>
						defaultVendorName(
							target
								.replace(/\.git$/, "")
								.split(/[/:]/)
								.pop() || "repo",
						),
					),
					url: normalizeRepositoryUrl(target) ?? target,
					version: yield* Option.match(ref, {
						onNone: () =>
							Effect.fail(
								new CommandError({
									message: "when adding a git URL, pass --ref <tag>",
								}),
							),
						onSome: Effect.succeed,
					}),
				}
			: yield* resolveInstalledSource(target);

		const vendorName = Option.getOrElse(name, () =>
			defaultVendorName(source.packageName),
		);
		const manifest = yield* project.readManifest;
		yield* ensureNotVendored(manifest, vendorName);
		const prefix = repoPrefix(manifest, vendorName);
		if (yield* checkoutExists(manifest, vendorName)) {
			return yield* new CommandError({
				message:
					`${prefix} already exists on disk but is not in vendor-src.json.\n` +
					`Remove it, then add it again:\n  git rm -rq ${prefix} && git commit -m "Remove ${prefix}"\n  vendor-src add ${source.packageName}`,
			});
		}

		const gitRef = Option.isSome(ref)
			? ref.value
			: yield* git.resolveTag(source.url, source.packageName, source.version);

		yield* Console.log(
			`Vendoring ${source.packageName}@${source.version} as ${prefix} (${gitRef})`,
		);
		yield* git.subtreeAdd(prefix, source.url, gitRef);

		const updated = setRepo(manifest, vendorName, {
			package: source.packageName,
			url: source.url,
			version: source.version,
			ref: gitRef,
			ignore,
		});
		yield* pruneIgnoredPaths(updated, vendorName);
		yield* writeProjectFiles(updated);

		yield* Console.log(
			`Added ${prefix}. Commit vendor-src.json, AGENTS.md, ${vendorDir(updated)}/AGENTS.md, and editor ignores.`,
		);
	}, reportErrors),
).pipe(
	Command.withDescription(
		"Vendor a dependency's source into the vendor dir at the installed version's git tag",
	),
	Command.withExamples([
		{
			command: "vendor-src add effect",
			description: "Vendor an installed package",
		},
		{
			command:
				"vendor-src add effect --ignore 'scratchpad/**' --ignore '**/.github/**'",
			description: "Prune paths you never want agents to read",
		},
		{
			command: "vendor-src add https://github.com/org/repo.git --ref v1.2.3",
			description: "Vendor a git repository directly",
		},
	]),
);
