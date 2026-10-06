import { Console, Effect, FileSystem } from "effect";

import { Git } from "./git.ts";
import { selectIgnoredPaths } from "./ignore.ts";
import { repoPrefix, type Manifest } from "./manifest.ts";
import { Project } from "./project.ts";

/**
 * Delete paths matching the repo's `ignore` globs and commit the removal.
 * Returns the pruned paths, relative to the vendored repo root.
 */
export const pruneIgnoredPaths = Effect.fn("pruneIgnoredPaths")(function* (
	manifest: Manifest,
	name: string,
) {
	const patterns = manifest.repos[name]?.ignore ?? [];
	if (patterns.length === 0) {
		return [];
	}

	const fs = yield* FileSystem.FileSystem;
	const project = yield* Project;
	const git = yield* Git;

	const prefix = repoPrefix(manifest, name);
	const repoRoot = project.resolve(prefix);
	const ignored = selectIgnoredPaths(
		yield* fs.readDirectory(repoRoot, { recursive: true }),
		patterns,
	);
	if (ignored.length === 0) {
		return [];
	}

	yield* Console.log(
		`Pruning ${ignored.length} ignored path(s) from ${prefix}`,
	);
	yield* Effect.forEach(
		ignored,
		(entry) =>
			fs.remove(project.resolve(`${prefix}/${entry}`), {
				recursive: true,
				force: true,
			}),
		{ discard: true },
	);
	const committed = yield* git.commitAll(
		`chore(vendor): prune ignored paths from ${name}`,
	);
	if (!committed) {
		yield* Console.log("No ignored paths left to commit.");
	}
	return ignored;
});
