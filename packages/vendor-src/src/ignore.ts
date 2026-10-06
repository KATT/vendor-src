import picomatch from "picomatch";

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

const toPosix = (path: string) => path.replaceAll("\\", "/");

export function matchesIgnore(
	relativePath: string,
	patterns: readonly IgnoreMatcher[],
): boolean {
	const normalized = toPosix(relativePath);
	return patterns.some((pattern) => pattern(normalized));
}

/**
 * Pick the paths to delete from a recursive listing of a vendored repo.
 *
 * Only the top-most match is returned: once a directory matches, nothing
 * beneath it is listed separately. Results are sorted posix paths.
 */
export function selectIgnoredPaths(
	paths: Iterable<string>,
	patterns: readonly string[],
): string[] {
	if (patterns.length === 0) {
		return [];
	}
	const matchers = compileIgnorePatterns(patterns);
	const selected = new Set<string>();
	for (const path of [...paths].map(toPosix).toSorted()) {
		const segments = path.split("/");
		const underSelected = segments
			.slice(0, -1)
			.some((_, index) => selected.has(segments.slice(0, index + 1).join("/")));
		if (!underSelected && matchesIgnore(path, matchers)) {
			selected.add(path);
		}
	}
	return [...selected];
}

/** Pre-0.3.4 manifests used regex strings; picomatch treats them as globs and they won't match. */
export function isLegacyRegexIgnorePattern(pattern: string): boolean {
	return pattern.includes("(^|/");
}
