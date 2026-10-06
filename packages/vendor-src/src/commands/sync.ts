import { Console, Effect } from "effect";
import { Argument, Command } from "effect/cli";

import {
	ensureCleanTree,
	ensureHasCommits,
	resolveTag,
	subtreePull,
} from "../git.ts";
import { resolveInstalledVersion } from "../installedVersions.ts";
import { pruneIgnoredPaths } from "../prune.ts";
import {
	findProjectRoot,
	readManifest,
	updateAgentsMd,
	writeManifest,
} from "../project.ts";

export const syncCommand = Command.make(
	"sync",
	{
		names: Argument.String("name").pipe(
			Argument.withDescription("Optional vendored repo names to sync"),
			Argument.variadic,
		),
	},
	Effect.fn(function* ({ names }) {
		const projectRoot = yield* findProjectRoot;
		yield* ensureHasCommits;
		yield* ensureCleanTree;

		const manifest = yield* readManifest(projectRoot);
		const requested = names as ReadonlyArray<string>;
		const selected =
			requested.length > 0 ? requested : Object.keys(manifest.repos);

		if (selected.length === 0) {
			yield* Console.log("No vendored repositories to sync.");
			return;
		}

		let updated = 0;
		for (const name of selected) {
			const entry = manifest.repos[name];
			if (!entry) {
				yield* Console.log(`Skipping unknown vendored repo: ${name}`);
				continue;
			}

			const installed = resolveInstalledVersion(entry.package, projectRoot);
			if (!installed) {
				yield* Console.log(
					`Skipping ${name}: ${entry.package} is not installed`,
				);
				continue;
			}

			const prefix = `${manifest.dir}/${name}`;
			if (installed === entry.version) {
				yield* Console.log(`${name}: already at ${entry.version}`);
			} else {
				const ref = yield* resolveTag(entry.url, entry.package, installed);
				yield* Console.log(
					`Syncing ${name}: ${entry.version} -> ${installed} (${ref})`,
				);
				yield* subtreePull(prefix, entry.url, ref);
				manifest.repos[name] = {
					...entry,
					version: installed,
					ref,
				};
				updated += 1;
			}

			// Always prune so ignore-pattern edits apply without a version bump.
			yield* pruneIgnoredPaths({
				projectRoot,
				vendorName: name,
				manifest,
			});
		}

		// Always refresh AGENTS so format migrations and repos/AGENTS.md apply
		// even when installed versions already match the manifest.
		yield* updateAgentsMd(projectRoot, manifest);

		if (updated > 0) {
			yield* writeManifest(projectRoot, manifest);
			yield* Console.log(
				`Updated ${updated} vendored repo(s). Commit the subtree and vendor-src.json changes.`,
			);
		}
	}),
).pipe(
	Command.withDescription(
		"Pull vendored repos to the git tags matching installed package versions",
	),
);
