export const MANIFEST_FILENAME = "vendor-src.json";

export interface VendoredRepo {
	package: string;
	url: string;
	version: string;
	ref: string;
}

export interface VendorSrcManifest {
	dir: string;
	repos: Record<string, VendoredRepo>;
}

export const emptyManifest = (): VendorSrcManifest => ({
	dir: "repos",
	repos: {},
});

export function parseManifest(raw: string): VendorSrcManifest {
	const parsed = JSON.parse(raw) as Partial<VendorSrcManifest>;
	return {
		dir:
			typeof parsed.dir === "string" && parsed.dir.length > 0
				? parsed.dir
				: "repos",
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
