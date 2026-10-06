import { describe, expect, it } from "vite-plus/test";

import {
	compileIgnorePatterns,
	isLegacyRegexIgnorePattern,
	matchesIgnore,
	selectIgnoredPaths,
} from "./ignore.ts";

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

describe(selectIgnoredPaths, () => {
	const listing = [
		"src",
		"src/ok.ts",
		"src/.DS_Store",
		".DS_Store",
		"scratchpad",
		"scratchpad/tmp.ts",
		"scratchpad/nested",
		"scratchpad/nested/.DS_Store",
		"repos/nested/x.ts",
	];

	it("returns nothing without patterns", () => {
		expect(selectIgnoredPaths(listing, [])).toEqual([]);
	});

	it("returns only the outermost match of each ignored tree", () => {
		expect(
			selectIgnoredPaths(listing, ["scratchpad/**", "**/.DS_Store"]),
		).toEqual([".DS_Store", "scratchpad", "src/.DS_Store"]);
	});

	it("accepts Windows-style separators", () => {
		expect(selectIgnoredPaths(["docs", "docs\\guide.md"], ["docs/**"])).toEqual(
			["docs"],
		);
	});
});
