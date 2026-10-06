import { compareSemver } from "./semver.ts";

/** Unscoped package name, e.g. `@effect/platform-node` -> `platform-node`. */
export function unscopedName(packageName: string): string {
	const slash = packageName.lastIndexOf("/");
	return slash === -1 ? packageName : packageName.slice(slash + 1);
}

/** Candidate git tags for an installed package version, most specific first. */
export function candidateTags(packageName: string, version: string): string[] {
	const unscoped = unscopedName(packageName);
	const tags = [
		`${packageName}@${version}`,
		`${packageName}@v${version}`,
		`${unscoped}@${version}`,
		`${unscoped}@v${version}`,
		`v${version}`,
		version,
	];
	return [...new Set(tags)];
}

/**
 * Pick the best matching tag from `git ls-remote --tags` output.
 * When multiple tags match, prefer the highest semver-looking tag name.
 */
export function pickTag(
	remoteTags: Iterable<string>,
	packageName: string,
	version: string,
): string | undefined {
	const available = new Set(remoteTags);
	const exact = candidateTags(packageName, version).find((tag) =>
		available.has(tag),
	);
	if (exact) {
		return exact;
	}

	const prefixMatches = [...available].filter(
		(tag) =>
			tag === version ||
			tag === `v${version}` ||
			tag.endsWith(`@${version}`) ||
			tag.endsWith(`@v${version}`),
	);

	if (prefixMatches.length === 0) {
		return undefined;
	}

	return prefixMatches.toSorted((left, right) => {
		const leftVersion = extractVersion(left);
		const rightVersion = extractVersion(right);
		if (leftVersion && rightVersion) {
			return compareSemver(rightVersion, leftVersion);
		}
		return right.localeCompare(left);
	})[0];
}

function extractVersion(tag: string): string | undefined {
	const at = tag.lastIndexOf("@");
	if (at !== -1) {
		return tag.slice(at + 1).replace(/^v/, "");
	}
	return tag.replace(/^v/, "");
}

/** Parse `git ls-remote --tags` stdout into tag names (peeled ^{} refs dropped). */
export function parseLsRemoteTags(stdout: string): string[] {
	const tags: string[] = [];
	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.endsWith("^{}")) {
			continue;
		}
		const ref = trimmed.split(/\s+/)[1];
		if (!ref?.startsWith("refs/tags/")) {
			continue;
		}
		tags.push(ref.slice("refs/tags/".length));
	}
	return tags;
}
