import { unscopedName } from "./tags.ts";

export interface PackageRepository {
	readonly type?: string;
	readonly url?: string;
	readonly directory?: string;
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

/** Default checkout directory name, e.g. `@effect/platform-node` -> `platform-node`. */
export const defaultVendorName = (packageName: string): string =>
	unscopedName(packageName);
