export const MANIFEST_FILENAME = "vendor-src.json";

export interface VendoredRepo {
	package: string;
	url: string;
	version: string;
	ref: string;
	/** Extra path regexes to prune from this vendored repo after subtree add/pull. */
	ignore?: string[];
}

export interface VendorSrcManifest {
	dir: string;
	/**
	 * Regex patterns matched against paths relative to each vendored repo root.
	 * Defaults always include `.DS_Store`, nested `repos/`, `node_modules/`, and `.git/`.
	 */
	ignore?: string[];
	repos: Record<string, VendoredRepo>;
}

export const emptyManifest = (): VendorSrcManifest => ({
	dir: "repos",
	ignore: [],
	repos: {},
});

export function parseManifest(raw: string): VendorSrcManifest {
	const parsed = JSON.parse(raw) as Partial<VendorSrcManifest>;
	return {
		dir:
			typeof parsed.dir === "string" && parsed.dir.length > 0
				? parsed.dir
				: "repos",
		ignore: Array.isArray(parsed.ignore)
			? parsed.ignore.filter(
					(entry): entry is string => typeof entry === "string",
				)
			: [],
		repos:
			parsed.repos &&
			typeof parsed.repos === "object" &&
			!Array.isArray(parsed.repos)
				? parsed.repos
				: {},
	};
}

export function stringifyManifest(manifest: VendorSrcManifest): string {
	return `${JSON.stringify(manifest, null, "\t")}\n`;
}

export interface Drift {
	name: string;
	package: string;
	vendored: string;
	installed: string | undefined;
}

export function findDrift(
	manifest: VendorSrcManifest,
	installed: ReadonlyMap<string, string>,
): Drift[] {
	const drifts: Drift[] = [];
	for (const [name, repo] of Object.entries(manifest.repos)) {
		const current = installed.get(repo.package);
		if (current !== repo.version) {
			drifts.push({
				name,
				package: repo.package,
				vendored: repo.version,
				installed: current,
			});
		}
	}
	return drifts;
}
