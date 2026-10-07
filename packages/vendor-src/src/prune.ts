import { Console, Effect, FileSystem, Path } from "effect";

import { Git } from "./git.ts";
import { selectIgnoredPaths } from "./ignore.ts";
import { repoPrefix, type Manifest } from "./manifest.ts";
import { Project } from "./project.ts";

/**
 * Delete paths matching the repo's `ignore` globs and commit the deletion.
 * Returns the pruned paths, relative to the vendored repo root.
 */
export const pruneIgnoredPaths = Effect.fn("pruneIgnoredPaths")(function* (
	manifest: Manifest,
	name: string,
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const project = yield* Project;
	const git = yield* Git;

	const patterns = manifest.repos[name]?.ignore ?? [];
	const prefix = repoPrefix(manifest, name);
	const root = project.resolve(prefix);
	if (patterns.length === 0 || !(yield* fs.exists(root))) {
		return [];
	}

	const ignored = selectIgnoredPaths(
		yield* fs.readDirectory(root, { recursive: true }),
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
			fs.remove(path.join(root, entry), { recursive: true, force: true }),
		{ discard: true },
	);
	const committed = yield* git.commitPath(
		prefix,
		`chore(vendor): prune ignored paths from ${name}`,
	);
	if (!committed) {
		yield* Console.log("No ignored paths left to commit.");
	}
	return ignored;
});
