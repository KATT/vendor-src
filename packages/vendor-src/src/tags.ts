import { compareSemver, parseSemver } from "./semver.ts";

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
			tag.endsWith(`@v${version}`) ||
			tag.endsWith(`/${version}`) ||
			tag.endsWith(`/v${version}`),
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
	const separator = Math.max(tag.lastIndexOf("@"), tag.lastIndexOf("/"));
	return tag.slice(separator + 1).replace(/^v/, "");
}

export interface VersionedTag {
	/** Everything before the version, e.g. `effect@`, `v`, `npm/`, or ``. */
	readonly prefix: string;
	readonly version: string;
}

const versionedTagPattern =
	/^(.*?)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;

/** Split a tag like `effect@4.0.1` into its prefix and semver version. */
export function parseVersionedTag(tag: string): VersionedTag | undefined {
	const match = versionedTagPattern.exec(tag.replace(/^refs\/tags\//, ""));
	if (!match || parseSemver(match[2]!) === undefined) {
		return undefined;
	}
	return { prefix: match[1]!, version: match[2]! };
}

/**
 * The highest-versioned tag with the same prefix as `currentTag`, or
 * undefined when `currentTag` has no version or nothing matches. Prereleases
 * are only considered when `currentTag` is itself a prerelease.
 */
export function newestMatchingTag(
	remoteTags: Iterable<string>,
	currentTag: string,
): string | undefined {
	const current = parseVersionedTag(currentTag);
	if (current === undefined) {
		return undefined;
	}
	const allowPrerelease = parseSemver(current.version)!.prerelease.length > 0;
	let newest: { readonly tag: string; readonly version: string } | undefined;
	for (const tag of remoteTags) {
		const parsed = parseVersionedTag(tag);
		if (parsed === undefined || parsed.prefix !== current.prefix) {
			continue;
		}
		if (
			!allowPrerelease &&
			parseSemver(parsed.version)!.prerelease.length > 0
		) {
			continue;
		}
		if (
			newest === undefined ||
			compareSemver(parsed.version, newest.version) > 0
		) {
			newest = { tag, version: parsed.version };
		}
	}
	return newest?.tag;
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

/** The commit SHA of `HEAD` from `git ls-remote <url> HEAD` stdout. */
export function parseLsRemoteHead(stdout: string): string | undefined {
	for (const line of stdout.split("\n")) {
		const [sha, ref] = line.trim().split(/\s+/);
		if (ref === "HEAD" && sha !== undefined && /^[0-9a-f]{40,64}$/i.test(sha)) {
			return sha.toLowerCase();
		}
	}
	return undefined;
}
