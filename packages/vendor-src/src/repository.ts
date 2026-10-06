export interface PackageRepository {
	type?: string;
	url?: string;
	directory?: string;
}

/**
 * Normalize a package.json `repository` field into an https git URL suitable
 * for `git subtree` / `git ls-remote`.
 */
export function normalizeRepositoryUrl(
	repository: string | PackageRepository | undefined,
): string | undefined {
	if (!repository) {
		return undefined;
	}

	const raw = typeof repository === "string" ? repository : repository.url;
	if (!raw) {
		return undefined;
	}

	let url = raw.trim();

	if (url.startsWith("git+")) {
		url = url.slice(4);
	}

	if (url.startsWith("github:")) {
		url = `https://github.com/${url.slice("github:".length)}`;
	} else if (url.startsWith("gitlab:")) {
		url = `https://gitlab.com/${url.slice("gitlab:".length)}`;
	} else if (url.startsWith("bitbucket:")) {
		url = `https://bitbucket.org/${url.slice("bitbucket:".length)}`;
	} else if (/^[^/@]+\/[^/]+$/.test(url)) {
		url = `https://github.com/${url}`;
	}

	url = url.replace(/^git@github\.com:/, "https://github.com/");
	url = url.replace(/^ssh:\/\/git@github\.com\//, "https://github.com/");

	if (url.endsWith(".git")) {
		return url;
	}

	// Drop trailing slash / tree paths that sometimes appear in metadata
	url = url.replace(/\/$/, "");
	url = url.replace(/\/tree\/[^/]+.*$/, "");

	return `${url}.git`;
}

export function defaultVendorName(
	packageName: string,
	repository?: PackageRepository | string,
): string {
	if (typeof repository === "object" && repository.directory) {
		const parts = repository.directory.split("/").filter(Boolean);
		const last = parts.at(-1);
		if (last && last !== "packages") {
			return last;
		}
	}
	const unscoped = packageName.includes("/")
		? packageName.slice(packageName.lastIndexOf("/") + 1)
		: packageName;
	return unscoped;
}
