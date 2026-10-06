import { describe, expect, it } from "vite-plus/test";

import {
	DEFAULT_IGNORE,
	findIgnoredPaths,
	isLegacyRegexIgnorePattern,
	matchesIgnore,
	compileIgnorePatterns,
	resolveIgnorePatterns,
} from "./ignore.ts";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe(matchesIgnore, () => {
	it("matches user globs including directory/**", () => {
		const custom = compileIgnorePatterns([
			"scratchpad",
			"docs/**",
			"**/.DS_Store",
		]);
		expect(matchesIgnore("scratchpad", custom)).toBe(true);
		expect(matchesIgnore("docs", custom)).toBe(true);
		expect(matchesIgnore("docs/guide.md", custom)).toBe(true);
		expect(matchesIgnore("src/docs", custom)).toBe(false);
		expect(matchesIgnore(".DS_Store", custom)).toBe(true);
		expect(matchesIgnore("src/.DS_Store", custom)).toBe(true);
	});

	it("does not match when no patterns are configured", () => {
		expect(matchesIgnore("repos/effect", compileIgnorePatterns([]))).toBe(
			false,
		);
	});
});

describe(isLegacyRegexIgnorePattern, () => {
	it("flags pre-0.3.4 regex-style ignore strings", () => {
		expect(isLegacyRegexIgnorePattern("(^|/)scratchpad(/|$)")).toBe(true);
		expect(isLegacyRegexIgnorePattern("scratchpad/**")).toBe(false);
	});
});

describe(resolveIgnorePatterns, () => {
	it("has no built-in defaults", () => {
		expect(DEFAULT_IGNORE).toEqual([]);
		expect(resolveIgnorePatterns({})).toEqual([]);
	});

	it("merges per-repo and CLI overrides only", () => {
		const patterns = resolveIgnorePatterns({
			repoIgnore: ["docs"],
			cliIgnore: ["scratchpad/**"],
		});
		expect(patterns).toEqual(["docs", "scratchpad/**"]);
	});
});

describe(findIgnoredPaths, () => {
	it("returns matching paths under a tree", () => {
		const root = mkdtempSync(join(tmpdir(), "vendor-src-ignore-"));
		mkdirSync(join(root, "repos", "nested"), { recursive: true });
		writeFileSync(join(root, "repos", "nested", "x.ts"), "export {}");
		writeFileSync(join(root, ".DS_Store"), "");
		mkdirSync(join(root, "scratchpad"));
		writeFileSync(join(root, "scratchpad", "tmp.ts"), "export {}");
		mkdirSync(join(root, "src"));
		writeFileSync(join(root, "src", "ok.ts"), "export {}");

		expect(findIgnoredPaths(root, [])).toEqual([]);
		expect(findIgnoredPaths(root, ["scratchpad/**", "**/.DS_Store"])).toEqual([
			".DS_Store",
			"scratchpad",
		]);
	});
});
