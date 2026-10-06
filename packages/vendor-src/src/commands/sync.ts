import { Console, Effect, Option } from "effect";
import { Argument, Command } from "effect/cli";

import { Git } from "../git.ts";
import { InstalledPackages } from "../installedPackages.ts";
import { repoPrefix, setRepo } from "../manifest.ts";
import { Project } from "../project.ts";
import { pruneIgnoredPaths } from "../prune.ts";
import { CommandError, toUserError } from "./shared.ts";

export const syncCommand = Command.make(
	"sync",
	{
		names: Argument.String("name").pipe(
			Argument.withDescription("Vendored repo names to sync (default: all)"),
			Argument.variadic(),
		),
	},
	Effect.fn("sync")(function* ({ names }) {
		const project = yield* Project;
		const packages = yield* InstalledPackages;
		const git = yield* Git;
		yield* git.ensureCleanWorkingTree;

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
				const ref = yield* git.resolveTag({
					url: entry.url,
					packageName: entry.package,
					version: installed.value,
				});
				yield* Console.log(
					`Syncing ${name}: ${entry.version} -> ${installed.value} (${ref})`,
				);
				yield* git.subtreePull({
					prefix: repoPrefix(manifest, name),
					url: entry.url,
					ref,
				});
				manifest = setRepo(manifest, name, {
					...entry,
					version: installed.value,
					ref,
				});
				updated += 1;
			}

			// Always prune so ignore-pattern edits apply without a version bump.
			yield* pruneIgnoredPaths(manifest, name);
		}

		// Always refresh AGENTS so format migrations and {dir}/AGENTS.md apply
		// even when installed versions already match the manifest.
		yield* project.writeAgentsMd(manifest);

		if (updated > 0) {
			yield* project.writeManifest(manifest);
			yield* Console.log(
				`Updated ${updated} vendored repo(s). Commit the subtree and vendor-src.json changes.`,
			);
		}
	}, Effect.mapError(toUserError)),
).pipe(
	Command.withDescription(
		"Pull vendored repos to the git tags matching installed package versions",
	),
);
