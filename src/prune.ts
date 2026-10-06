import { Console, Effect, Path } from "effect";

import { commitAll, removePaths } from "./git.ts";
import { findIgnoredPaths, resolveIgnorePatterns } from "./ignore.ts";
import type { VendorSrcManifest } from "./manifest.ts";

export const pruneIgnoredPaths = (options: {
	projectRoot: string;
	vendorName: string;
	manifest: VendorSrcManifest;
	cliIgnore?: readonly string[];
}) =>
	Effect.gen(function* () {
		const path = yield* Path.Path;
		const prefix = path.join(
			options.projectRoot,
			options.manifest.dir,
			options.vendorName,
		);
		const patterns = resolveIgnorePatterns({
			manifestIgnore: options.manifest.ignore,
			repoIgnore: options.manifest.repos[options.vendorName]?.ignore,
			cliIgnore: options.cliIgnore,
		});
		const relativeIgnored = findIgnoredPaths(prefix, patterns);
		if (relativeIgnored.length === 0) {
			return [];
		}

		const absolute = relativeIgnored.map((entry) => path.join(prefix, entry));
		yield* Console.log(
			`Pruning ${relativeIgnored.length} ignored path(s) from ${options.manifest.dir}/${options.vendorName}`,
		);
		yield* removePaths(absolute);
		const committed = yield* commitAll(
			`chore(vendor): prune ignored paths from ${options.vendorName}`,
		);
		if (!committed) {
			yield* Console.log("No ignored paths left to commit.");
		}
		return relativeIgnored;
	});
