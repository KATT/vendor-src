import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Default ignore regexes applied to every vendored repo (posix paths). */
export const DEFAULT_IGNORE: readonly string[] = [
	"(^|/)\\.DS_Store$",
	"(^|/)repos(/|$)",
	"(^|/)node_modules(/|$)",
	"(^|/)\\.git(/|$)",
];

export function compileIgnorePatterns(patterns: readonly string[]): RegExp[] {
	return patterns.map((pattern) => new RegExp(pattern));
}

export function matchesIgnore(
	relativePath: string,
	patterns: readonly RegExp[],
): boolean {
	const normalized = relativePath.split(sep).join("/");
	return patterns.some((pattern) => pattern.test(normalized));
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
