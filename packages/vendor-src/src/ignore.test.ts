import { describe, expect, it } from "vite-plus/test";

import {
	DEFAULT_IGNORE,
	findIgnoredPaths,
	matchesIgnore,
	compileIgnorePatterns,
	resolveIgnorePatterns,
} from "./ignore.ts";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe(matchesIgnore, () => {
	const patterns = compileIgnorePatterns(DEFAULT_IGNORE);

	it("matches nested repos directories", () => {
		expect(matchesIgnore("repos/effect", patterns)).toBe(true);
		expect(matchesIgnore("packages/foo/repos/bar", patterns)).toBe(true);
		expect(matchesIgnore("repos", patterns)).toBe(true);
	});

	it("matches .DS_Store", () => {
		expect(matchesIgnore(".DS_Store", patterns)).toBe(true);
		expect(matchesIgnore("src/.DS_Store", patterns)).toBe(true);
	});

	it("does not match normal source", () => {
		expect(matchesIgnore("packages/effect/src/index.ts", patterns)).toBe(false);
	});

	it("matches user globs including directory/**", () => {
		const custom = compileIgnorePatterns(["scratchpad", "docs/**"]);
		expect(matchesIgnore("scratchpad", custom)).toBe(true);
		expect(matchesIgnore("docs", custom)).toBe(true);
		expect(matchesIgnore("docs/guide.md", custom)).toBe(true);
		expect(matchesIgnore("src/docs", custom)).toBe(false);
	});
});

describe(resolveIgnorePatterns, () => {
	it("merges defaults with per-repo and CLI overrides", () => {
		const patterns = resolveIgnorePatterns({
			repoIgnore: ["docs"],
			cliIgnore: ["scratchpad/**"],
		});
		expect(patterns).toContain("**/repos/**");
		expect(patterns).toContain("docs");
		expect(patterns).toContain("scratchpad/**");
	});
});

describe(findIgnoredPaths, () => {
	it("returns matching paths under a tree", () => {
		const root = mkdtempSync(join(tmpdir(), "vendor-src-ignore-"));
		mkdirSync(join(root, "repos", "nested"), { recursive: true });
		writeFileSync(join(root, "repos", "nested", "x.ts"), "export {}");
		writeFileSync(join(root, ".DS_Store"), "");
		mkdirSync(join(root, "src"));
		writeFileSync(join(root, "src", "ok.ts"), "export {}");

		expect(findIgnoredPaths(root, [...DEFAULT_IGNORE])).toEqual([
			".DS_Store",
			"repos",
		]);
	});
});
