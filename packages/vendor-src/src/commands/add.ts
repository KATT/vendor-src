import { Console, Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import { Git } from "../git.ts";
import {
	findRepoByUrl,
	pinnedPackage,
	repoPrefix,
	setRepo,
} from "../manifest.ts";
import { InstalledPackages } from "../packages.ts";
import { Project } from "../project.ts";
import { pruneIgnoredPaths } from "../prune.ts";
import {
	defaultCheckoutName,
	defaultVendorName,
	normalizeRepositoryUrl,
	repositorySlug,
} from "../repository.ts";
import {
	checkoutExists,
	CommandError,
	ensurePackageNotVendored,
	nameFlag,
	refFlag,
	reportErrors,
	resolveInstalledSource,
	type InstalledSource,
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
		const packages = yield* InstalledPackages;
		const manifest = yield* project.readManifest;
		yield* git.ensureReady;

		const fromGitUrl = isGitUrl(target);
		const source: InstalledSource = fromGitUrl
			? yield* Effect.gen(function* () {
					const gitRef = yield* Option.match(ref, {
						onNone: () =>
							Effect.fail(
								new CommandError({
									message: "when adding a git URL, pass --ref <tag>",
								}),
							),
						onSome: Effect.succeed,
					});
					const packageName = Option.getOrElse(name, () =>
						defaultVendorName(
							target
								.replace(/\.git$/, "")
								.split(/[/:]/)
								.pop() || "repo",
						),
					);
					// When --name is an installed package, pin its installed version so
					// `check` and `sync` track it like any other package.
					const installed = yield* packages.version(packageName);
					return {
						packageName,
						url: normalizeRepositoryUrl(target) ?? target,
						version: Option.getOrElse(installed, () => gitRef),
					};
				})
			: yield* resolveInstalledSource(target);

		yield* ensurePackageNotVendored(manifest, source.packageName);

		const sameRepo = findRepoByUrl(manifest, source.url);
		if (sameRepo !== undefined) {
			const [existingName, existing] = sameRepo;
			const existingPrefix = repoPrefix(manifest, existingName);
			const pinned = `${pinnedPackage(existing)}@${existing.version}`;
			const conflict = fromGitUrl
				? `${source.url} is already vendored at ${existingPrefix}`
				: Option.isSome(name) && name.value !== existingName
					? `--name ${name.value} would check out ${repositorySlug(source.url)} a second time; it is already vendored at ${existingPrefix}`
					: Option.isSome(ref)
						? `--ref can't be used for ${source.packageName}: it shares ${existingPrefix}, which is pinned by ${pinned}`
						: undefined;
			if (conflict !== undefined) {
				return yield* new CommandError({ message: conflict });
			}

			const [pin, ...shared] = existing.packages;
			const updated = setRepo(manifest, existingName, {
				...existing,
				packages: [
					pin,
					...[...shared, source.packageName].toSorted((a, b) =>
						a.localeCompare(b),
					),
				],
				ignore: [...new Set([...(existing.ignore ?? []), ...ignore])],
			});
			if (ignore.length > 0) {
				yield* pruneIgnoredPaths(updated, existingName);
			}
			const changed = [
				...(yield* project.writeManifest(updated)),
				...(yield* project.writeAgentsMd(updated)),
			];

			const sourcePath =
				source.directory === undefined
					? existingPrefix
					: `${existingPrefix}/${source.directory}`;
			const inCheckout = yield* project.checkoutPackageVersion(sourcePath);
			const versions = Option.match(inCheckout, {
				onNone: () => "",
				onSome: (version) =>
					version === source.version
						? ` (${version}, same as installed)`
						: ` (${version} in the checkout, ${source.version} installed; the checkout follows ${pin})`,
			});
			yield* Console.log(
				[
					`${source.packageName} comes from ${repositorySlug(source.url)}, which is already vendored at ${existingPrefix} (pinned by ${pinned}).`,
					`Recorded it there instead of checking it out again. Source: ${sourcePath}${versions}`,
					`Commit: ${changed.join(", ")}`,
				].join("\n"),
			);
			return;
		}

		const vendorName = Option.getOrElse(name, () =>
			defaultCheckoutName(source),
		);
		const prefix = repoPrefix(manifest, vendorName);
		const taken = manifest.repos[vendorName];
		if (taken !== undefined) {
			return yield* new CommandError({
				message: `${prefix} is already used for ${repositorySlug(taken.url)}; pass --name <dir> to check out ${repositorySlug(source.url)} elsewhere`,
			});
		}
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
			packages: [source.packageName],
			url: source.url,
			version: source.version,
			ref: gitRef,
			ignore,
		});
		yield* pruneIgnoredPaths(updated, vendorName);
		const changed = [
			...(yield* project.writeManifest(updated)),
			...(yield* project.writeAgentsMd(updated)),
		];

		yield* Console.log(`Added ${prefix}. Commit: ${changed.join(", ")}`);
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
