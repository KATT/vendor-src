import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { maxSemver } from "./semver.ts";

export interface WorkspaceRoots {
	root: string;
	packages: string[];
}

/** Discover workspace package directories under a project root. */
export function discoverWorkspaceRoots(projectRoot: string): WorkspaceRoots {
	const packages = [projectRoot];
	const pnpmWorkspace = join(projectRoot, "pnpm-workspace.yaml");
	const packageJsonPath = join(projectRoot, "package.json");

	if (existsSync(pnpmWorkspace)) {
		const text = readFileSync(pnpmWorkspace, "utf8");
		for (const pattern of parsePnpmWorkspacePackages(text)) {
			packages.push(...expandGlobDirs(projectRoot, pattern));
		}
	}

	if (existsSync(packageJsonPath)) {
		try {
			const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
				workspaces?: string[] | { packages?: string[] };
			};
			const patterns = Array.isArray(pkg.workspaces)
				? pkg.workspaces
				: (pkg.workspaces?.packages ?? []);
			for (const pattern of patterns) {
				packages.push(...expandGlobDirs(projectRoot, pattern));
			}
		} catch {
			// ignore malformed package.json
		}
	}

	return { root: projectRoot, packages: [...new Set(packages)] };
}

/**
 * Extract `packages:` glob entries from pnpm-workspace.yaml.
 * Ignores catalog / onlyBuiltDependencies / other list sections.
 */
export function parsePnpmWorkspacePackages(text: string): string[] {
	const lines = text.split(/\r?\n/);
	const patterns: string[] = [];
	let inPackages = false;
	for (const line of lines) {
		if (/^\s*#/.test(line) || line.trim() === "") {
			continue;
		}
		const section = line.match(/^([A-Za-z][\w-]*)\s*:/);
		if (section) {
			inPackages = section[1] === "packages";
			continue;
		}
		if (!inPackages) {
			continue;
		}
		const item = line.match(/^\s*-\s*['"]?([^'"#\n]+?)['"]?\s*(?:#.*)?$/);
		if (item?.[1]) {
			patterns.push(item[1].trim());
		}
	}
	return patterns;
}

/** Expand workspace globs, including nested patterns like projects slash-star slash-star. */
export function expandGlobDirs(root: string, pattern: string): string[] {
	const normalized = pattern.replace(/\\/g, "/").replace(/\/$/, "");
	if (!normalized) {
		return [];
	}
	if (normalized.includes("**")) {
		// Double-star is uncommon for workspace roots; skip for now.
		return [];
	}
	return expandGlobParts(root, normalized.split("/"));
}

function expandGlobParts(base: string, parts: string[]): string[] {
	if (parts.length === 0) {
		try {
			return existsSync(base) && statSync(base).isDirectory() ? [base] : [];
		} catch {
			return [];
		}
	}

	const [head, ...tail] = parts;
	if (head === undefined) {
		return [];
	}

	if (head === "*") {
		if (!existsSync(base)) {
			return [];
		}
		try {
			return readdirSync(base).flatMap((name) => {
				const next = join(base, name);
				try {
					if (!statSync(next).isDirectory()) {
						return [];
					}
				} catch {
					return [];
				}
				return expandGlobParts(next, tail);
			});
		} catch {
			return [];
		}
	}

	if (head.includes("*")) {
		// Partial segment globs (e.g. `pkg-*`) are rare; skip for v1.
		return [];
	}

	return expandGlobParts(join(base, head), tail);
}

/** Resolve the highest installed version of a package across workspace roots. */
export function resolveInstalledVersion(
	packageName: string,
	projectRoot: string,
): string | undefined {
	const { packages } = discoverWorkspaceRoots(projectRoot);
	const versions = new Set<string>();

	for (const pkgRoot of packages) {
		try {
			const require = createRequire(join(pkgRoot, "package.json"));
			const resolved = require.resolve(`${packageName}/package.json`);
			const version = (
				JSON.parse(readFileSync(resolved, "utf8")) as { version?: string }
			).version;
			if (version) {
				versions.add(version);
			}
		} catch {
			// not installed in this workspace package
		}
	}

	// Also try from the project root module graph directly
	try {
		const require = createRequire(join(projectRoot, "package.json"));
		const resolved = require.resolve(`${packageName}/package.json`);
		const version = (
			JSON.parse(readFileSync(resolved, "utf8")) as { version?: string }
		).version;
		if (version) {
			versions.add(version);
		}
	} catch {
		// ignore
	}

	return maxSemver(versions);
}

export function resolveInstalledVersions(
	packageNames: Iterable<string>,
	projectRoot: string,
): Map<string, string> {
	const result = new Map<string, string>();
	for (const name of packageNames) {
		const version = resolveInstalledVersion(name, projectRoot);
		if (version) {
			result.set(name, version);
		}
	}
	return result;
}

export function readInstalledPackageJson(
	packageName: string,
	projectRoot: string,
):
	| {
			name: string;
			version: string;
			repository?: string | { type?: string; url?: string; directory?: string };
	  }
	| undefined {
	try {
		const require = createRequire(join(projectRoot, "package.json"));
		const resolved = require.resolve(`${packageName}/package.json`);
		return JSON.parse(readFileSync(resolved, "utf8")) as {
			name: string;
			version: string;
			repository?: string | { type?: string; url?: string; directory?: string };
		};
	} catch {
		return undefined;
	}
}
