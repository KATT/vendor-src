import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import picomatch from "picomatch";

/** Default ignore globs applied to every vendored repo (posix paths). */
export const DEFAULT_IGNORE: readonly string[] = [
	"**/.DS_Store",
	"**/repos/**",
	"**/node_modules/**",
	"**/.git/**",
];

export type IgnoreMatcher = (relativePath: string) => boolean;

/**
 * Compile glob patterns into matchers.
 *
 * Patterns are matched against posix paths relative to the vendored repo root.
 * A pattern ending in `/**` also matches the directory itself so pruning can
 * remove the whole tree in one step.
 */
export function compileIgnorePatterns(
	patterns: readonly string[],
): IgnoreMatcher[] {
	return patterns.map((pattern) => {
		const match = picomatch(pattern, { dot: true });
		const directoryPattern = pattern.endsWith("/**")
			? pattern.slice(0, -3)
			: undefined;
		const matchDirectory =
			directoryPattern && directoryPattern.length > 0
				? picomatch(directoryPattern, { dot: true })
				: undefined;
		return (relativePath: string) =>
			match(relativePath) || Boolean(matchDirectory?.(relativePath));
	});
}

export function matchesIgnore(
	relativePath: string,
	patterns: readonly IgnoreMatcher[],
): boolean {
	const normalized = relativePath.split(sep).join("/");
	return patterns.some((pattern) => pattern(normalized));
}

/** Walk a directory tree and return paths (relative to `root`) matching ignore patterns. */
export function findIgnoredPaths(
	root: string,
	patterns: readonly string[],
): string[] {
	if (patterns.length === 0) {
		return [];
	}
	const compiled = compileIgnorePatterns(patterns);
	const ignored: string[] = [];

	const visit = (absolute: string) => {
		let entries;
		try {
			entries = readdirSync(absolute, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const child = join(absolute, entry.name);
			const rel = relative(root, child);
			if (matchesIgnore(rel, compiled)) {
				ignored.push(rel);
				continue;
			}
			if (entry.isDirectory()) {
				visit(child);
			}
		}
	};

	visit(root);
	return ignored.toSorted();
}

export function resolveIgnorePatterns(options: {
	repoIgnore?: readonly string[];
	cliIgnore?: readonly string[];
}): string[] {
	return [
		...new Set([
			...DEFAULT_IGNORE,
			...(options.repoIgnore ?? []),
			...(options.cliIgnore ?? []),
		]),
	];
}
