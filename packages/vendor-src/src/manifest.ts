export const MANIFEST_FILENAME = "vendor-src.json";

/** Published schema URL for `$schema` in vendor-src.json (resolves via package export). */
export const MANIFEST_SCHEMA_URL = "https://unpkg.com/vendor-src/schema.json";

export interface VendoredRepo {
	package: string;
	url: string;
	version: string;
	ref: string;
	/** Path globs to prune from this vendored repo after subtree add/pull/sync. */
	ignore?: string[];
}

export interface VendorSrcManifest {
	$schema?: string;
	dir: string;
	repos: Record<string, VendoredRepo>;
}

export const emptyManifest = (): VendorSrcManifest => ({
	$schema: MANIFEST_SCHEMA_URL,
	dir: "repos",
	repos: {},
});

export function parseManifest(raw: string): VendorSrcManifest {
	const parsed = JSON.parse(raw) as Partial<VendorSrcManifest> & {
		ignore?: unknown;
	};
	const repos: Record<string, VendoredRepo> = {};
	if (
		parsed.repos &&
		typeof parsed.repos === "object" &&
		!Array.isArray(parsed.repos)
	) {
		for (const [name, repo] of Object.entries(parsed.repos)) {
			if (!repo || typeof repo !== "object" || Array.isArray(repo)) {
				continue;
			}
			const entry = repo as Partial<VendoredRepo>;
			repos[name] = {
				package: typeof entry.package === "string" ? entry.package : name,
				url: typeof entry.url === "string" ? entry.url : "",
				version: typeof entry.version === "string" ? entry.version : "",
				ref: typeof entry.ref === "string" ? entry.ref : "",
				...(Array.isArray(entry.ignore)
					? {
							ignore: entry.ignore.filter(
								(item): item is string => typeof item === "string",
							),
						}
					: {}),
			};
		}
	}

	return {
		$schema:
			typeof parsed.$schema === "string" && parsed.$schema.length > 0
				? parsed.$schema
				: MANIFEST_SCHEMA_URL,
		dir:
			typeof parsed.dir === "string" && parsed.dir.length > 0
				? parsed.dir
				: "repos",
		repos,
	};
}

export function stringifyManifest(manifest: VendorSrcManifest): string {
	const repos: Record<string, VendoredRepo> = {};
	for (const [name, repo] of Object.entries(manifest.repos)) {
		const entry: VendoredRepo = {
			package: repo.package,
			url: repo.url,
			version: repo.version,
			ref: repo.ref,
		};
		if (repo.ignore && repo.ignore.length > 0) {
			entry.ignore = [...repo.ignore];
		}
		repos[name] = entry;
	}

	return `${JSON.stringify(
		{
			$schema: manifest.$schema ?? MANIFEST_SCHEMA_URL,
			dir: manifest.dir,
			repos,
		},
		null,
		"\t",
	)}\n`;
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
