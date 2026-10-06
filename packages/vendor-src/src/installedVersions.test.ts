import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
	discoverWorkspaceRoots,
	expandGlobDirs,
	parsePnpmWorkspacePackages,
} from "./installedVersions.ts";

describe(parsePnpmWorkspacePackages, () => {
	it("reads only the packages section", () => {
		const text = `packages:
  - projects/*/*
  - packages/*
  - tooling/*

catalog:
  effect: ^4.0.1
  vendor-src: ^0.3.2

onlyBuiltDependencies:
  - esbuild
`;
		expect(parsePnpmWorkspacePackages(text)).toEqual([
			"projects/*/*",
			"packages/*",
			"tooling/*",
		]);
	});
});

describe(expandGlobDirs, () => {
	it("expands nested workspace globs like projects/*/*", () => {
		const root = mkdtempSync(join(tmpdir(), "vendor-src-ws-"));
		try {
			mkdirSync(join(root, "projects", "app", "web"), { recursive: true });
			mkdirSync(join(root, "projects", "app", "api"), { recursive: true });
			mkdirSync(join(root, "projects", "other"), { recursive: true });
			mkdirSync(join(root, "packages", "lib"), { recursive: true });

			expect(expandGlobDirs(root, "projects/*/*").sort()).toEqual(
				[
					join(root, "projects", "app", "api"),
					join(root, "projects", "app", "web"),
				].sort(),
			);
			expect(expandGlobDirs(root, "packages/*")).toEqual([
				join(root, "packages", "lib"),
			]);
			expect(expandGlobDirs(root, "missing/*")).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe(discoverWorkspaceRoots, () => {
	it("discovers nested pnpm workspace packages without catalog noise", () => {
		const root = mkdtempSync(join(tmpdir(), "vendor-src-discover-"));
		try {
			writeFileSync(
				join(root, "package.json"),
				JSON.stringify({ name: "root", private: true }),
			);
			writeFileSync(
				join(root, "pnpm-workspace.yaml"),
				`packages:
  - projects/*/*
  - packages/*

catalog:
  effect: ^4.0.1

onlyBuiltDependencies:
  - esbuild
`,
			);
			mkdirSync(join(root, "projects", "app", "web"), { recursive: true });
			mkdirSync(join(root, "packages", "lib"), { recursive: true });

			const { packages } = discoverWorkspaceRoots(root);
			expect(packages).toContain(root);
			expect(packages).toContain(join(root, "projects", "app", "web"));
			expect(packages).toContain(join(root, "packages", "lib"));
			expect(packages.some((path) => path.endsWith("esbuild"))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
