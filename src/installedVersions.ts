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
		for (const match of text.matchAll(/^\s*-\s*['"]?([^'"#\n]+)['"]?\s*$/gm)) {
			const pattern = match[1]?.trim();
			if (pattern) {
				packages.push(...expandGlobDirs(projectRoot, pattern));
			}
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

function expandGlobDirs(root: string, pattern: string): string[] {
	// Support simple patterns: "packages/*", "apps/*", or a single relative path.
	if (!pattern.includes("*")) {
		const path = join(root, pattern);
		return existsSync(path) ? [path] : [];
	}

	const [prefix, ...rest] = pattern.split("*");
	if (rest.join("*").includes("*")) {
		// Nested globs are uncommon for workspaces; skip for v1.
		return [];
	}

	const base = join(root, prefix.replace(/\/$/, ""));
	if (!existsSync(base)) {
		return [];
	}

	const suffix = rest[0] ?? "";
	return readdirSync(base)
		.map((name) => join(base, name + suffix))
		.filter((path) => {
			try {
				return statSync(path).isDirectory();
			} catch {
				return false;
			}
		});
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
