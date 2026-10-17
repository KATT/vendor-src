import { Console, Effect, Option } from "effect";
import { Argument, Command } from "effect/cli";

import { Git } from "../git.ts";
import { pinnedPackage, repoPrefix, setRepo } from "../manifest.ts";
import { InstalledPackages } from "../packages.ts";
import { Project } from "../project.ts";
import { pruneIgnoredPaths } from "../prune.ts";
import { CommandError, reportErrors } from "./shared.ts";

/**
 * Sync the named vendored repos (all when empty) to the installed versions,
 * and git-only repos to their newest upstream ref, then rewrite
 * `vendor-src.json` and the AGENTS.md files.
 */
export const syncRepos = Effect.fn("syncRepos")(function* (
	names: ReadonlyArray<string>,
) {
	const project = yield* Project;
	const packages = yield* InstalledPackages;
	const git = yield* Git;

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
	// Only the checkouts must be clean: sync usually runs right after an
	// upgrade, while package.json and the lockfile are still uncommitted.
	yield* git.ensureClean(selected.map((name) => repoPrefix(manifest, name)));

	// Resolve every target before touching a checkout, so one unresolvable
	// repo can't leave others committed while vendor-src.json stays stale.
	const targets: Array<{
		readonly name: string;
		readonly version: string;
		readonly ref: string;
	}> = [];
	for (const name of selected) {
		const entry = manifest.repos[name]!;
		const pin = pinnedPackage(entry);
		if (pin === undefined) {
			const ref = yield* git.latestRef(entry.url, entry.ref);
			if (ref === entry.ref) {
				yield* Console.log(`${name}: already at ${entry.ref} (git-only)`);
			} else {
				targets.push({ name, version: ref, ref });
			}
			continue;
		}
		const installed = yield* packages.version(pin);
		if (Option.isNone(installed)) {
			yield* Console.error(`Skipping ${name}: ${pin} is not installed`);
			continue;
		}
		if (installed.value === entry.version) {
			yield* Console.log(`${name}: already at ${entry.version}`);
		} else {
			const ref = yield* git.resolveTag(entry.url, pin, installed.value);
			targets.push({ name, version: installed.value, ref });
		}
	}

	for (const { name, version, ref } of targets) {
		const entry = manifest.repos[name]!;
		const detail = pinnedPackage(entry) === undefined ? "git-only" : ref;
		yield* Console.log(
			`Syncing ${name}: ${entry.version} -> ${version} (${detail})`,
		);
		yield* git.replaceSubtree(repoPrefix(manifest, name), entry.url, ref);
		manifest = setRepo(manifest, name, { ...entry, version, ref });
	}

	// Always prune so ignore-pattern edits apply without a version bump.
	for (const name of selected) {
		yield* pruneIgnoredPaths(manifest, name);
	}
	const updated = targets.length;

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
});

export const syncCommand = Command.make(
	"sync",
	{
		names: Argument.String("name").pipe(
			Argument.withDescription("Vendored repo names to sync (default: all)"),
			Argument.variadic(),
		),
	},
	Effect.fn("vendor-src sync")(function* ({ names }) {
		yield* syncRepos(names);
	}, reportErrors),
).pipe(
	Command.withDescription(
		"Pull vendored repos to the git tags matching installed package versions, and git-only repos to their newest upstream tag or commit",
	),
	Command.withExamples([
		{
			command: "vendor-src sync",
			description: "Sync every vendored repo after upgrading dependencies",
		},
		{
			command: "vendor-src sync effect",
			description: "Sync one checkout",
		},
	]),
);
