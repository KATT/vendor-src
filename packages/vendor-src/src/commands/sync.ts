import { Console, Effect, Option } from "effect";
import { Argument, Command } from "effect/cli";

import { Git } from "../git.ts";
import { repoPrefix, setRepo } from "../manifest.ts";
import { InstalledPackages } from "../packages.ts";
import { Project } from "../project.ts";
import { pruneIgnoredPaths } from "../prune.ts";
import { repositoryDirectory } from "../repository.ts";
import { CommandError, reportErrors } from "./shared.ts";

export const syncCommand = Command.make(
	"sync",
	{
		names: Argument.String("name").pipe(
			Argument.withDescription("Vendored repo names to sync (default: all)"),
			Argument.variadic(),
		),
	},
	Effect.fn("vendor-src sync")(function* ({ names }) {
		const project = yield* Project;
		const packages = yield* InstalledPackages;
		const git = yield* Git;
		yield* git.ensureReady;

		let manifest = yield* project.readManifest;
		const unknown = names.filter((name) => manifest.repos[name] === undefined);
		if (unknown.length > 0) {
			return yield* new CommandError({
				message: `no vendored repository named ${unknown.join(", ")}`,
			});
		}
		const selected = names.length > 0 ? names : Object.keys(manifest.repos);
		if (selected.length === 0) {
			yield* Console.log("No vendored repositories to sync.");
			return;
		}

		const installedDirectory = (packageName: string) =>
			Effect.map(packages.packageJson(packageName), (pkg) =>
				Option.isSome(pkg)
					? repositoryDirectory(pkg.value.repository)
					: undefined,
			);

		let updated = 0;
		for (const name of selected) {
			const entry = manifest.repos[name]!;
			const installed = yield* packages.version(entry.package);
			if (Option.isNone(installed)) {
				yield* Console.error(
					`Skipping ${name}: ${entry.package} is not installed`,
				);
				continue;
			}

			if (installed.value === entry.version) {
				yield* Console.log(`${name}: already at ${entry.version}`);
			} else {
				const ref = yield* git.resolveTag(
					entry.url,
					entry.package,
					installed.value,
				);
				yield* Console.log(
					`Syncing ${name}: ${entry.version} -> ${installed.value} (${ref})`,
				);
				yield* git.replaceSubtree(repoPrefix(manifest, name), entry.url, ref);
				manifest = setRepo(manifest, name, {
					...entry,
					version: installed.value,
					ref,
				});
				updated += 1;
			}

			// Backfill package paths for entries added before they were recorded.
			const current = manifest.repos[name]!;
			const directory =
				current.directory ?? (yield* installedDirectory(current.package));
			const siblings = yield* Effect.forEach(
				current.siblings ?? [],
				Effect.fnUntraced(function* (sibling) {
					const found =
						sibling.directory ?? (yield* installedDirectory(sibling.package));
					return found === undefined
						? sibling
						: { ...sibling, directory: found };
				}),
			);
			manifest = setRepo(manifest, name, {
				...current,
				...(directory === undefined ? {} : { directory }),
				siblings,
			});

			// Always prune so ignore-pattern edits apply without a version bump.
			yield* pruneIgnoredPaths(manifest, name);
		}

		// Always refresh AGENTS so format migrations apply even when versions match.
		const changed = [
			...(yield* project.writeManifest(manifest)),
			...(yield* project.writeAgentsMd(manifest)),
		];

		if (updated > 0) {
			yield* Console.log(`Updated ${updated} vendored repo(s).`);
		}
		if (changed.length > 0) {
			yield* Console.log(`Commit: ${changed.join(", ")}`);
		}
	}, reportErrors),
).pipe(
	Command.withDescription(
		"Pull vendored repos to the git tags matching installed package versions",
	),
);
