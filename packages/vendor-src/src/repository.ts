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

/**
 * The package's path inside its repo from `repository.directory`, e.g.
 * `packages/react-start`; undefined for packages at the repo root.
 */
export function repositoryDirectory(
	repository: string | PackageRepository | undefined,
): string | undefined {
	if (typeof repository !== "object" || !repository.directory) {
		return undefined;
	}
	const directory = repository.directory
		.trim()
		.replaceAll("\\", "/")
		.replace(/^(\.\/)+/, "")
		.replace(/\/+$/, "");
	return directory === "" || directory === "." ? undefined : directory;
}

/** Repository name from a git URL, e.g. `https://github.com/TanStack/router.git` -> `router`. */
export const repositoryName = (url: string): string =>
	url
		.replace(/\.git$/, "")
		.split(/[/:]/)
		.filter(Boolean)
		.pop() ?? url;

/** Repository owner/name for display, e.g. `TanStack/router`. */
export const repositorySlug = (url: string): string =>
	url
		.replace(/\.git$/, "")
		.split(/[/:]/)
		.filter(Boolean)
		.slice(-2)
		.join("/");

/**
 * Default checkout name: the repo name for packages that live in a
 * monorepo (`@tanstack/react-start` -> `router`), so every package from that
 * repo can share it; otherwise the unscoped package name.
 */
export const defaultCheckoutName = (source: {
	readonly packageName: string;
	readonly url: string;
	readonly directory?: string | undefined;
}): string =>
	source.directory === undefined
		? defaultVendorName(source.packageName)
		: repositoryName(source.url);
