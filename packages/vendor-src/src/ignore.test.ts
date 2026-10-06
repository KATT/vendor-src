import { assert, describe, it } from "@effect/vitest";

import {
	compileIgnorePatterns,
	isLegacyRegexIgnorePattern,
	matchesIgnore,
	selectIgnoredPaths,
} from "./ignore.ts";

describe("matchesIgnore", () => {
	it("matches user globs including directory/**", () => {
		const custom = compileIgnorePatterns([
			"scratchpad",
			"docs/**",
			"**/.DS_Store",
		]);
		assert.isTrue(matchesIgnore("scratchpad", custom));
		assert.isTrue(matchesIgnore("docs", custom));
		assert.isTrue(matchesIgnore("docs/guide.md", custom));
		assert.isFalse(matchesIgnore("src/docs", custom));
		assert.isTrue(matchesIgnore(".DS_Store", custom));
		assert.isTrue(matchesIgnore("src/.DS_Store", custom));
	});

	it("normalizes windows separators", () => {
		assert.isTrue(
			matchesIgnore("src\\.DS_Store", compileIgnorePatterns(["**/.DS_Store"])),
		);
	});

	it("does not match when no patterns are configured", () => {
		assert.isFalse(matchesIgnore("repos/effect", compileIgnorePatterns([])));
	});
});

describe("selectIgnoredPaths", () => {
	const listing = [
		".DS_Store",
		"scratchpad",
		"scratchpad/tmp.ts",
		"scratchpad/nested",
		"scratchpad/nested/.DS_Store",
		"src",
		"src/ok.ts",
		"src/.DS_Store",
	];

	it("returns only the top-most match, sorted", () => {
		assert.deepStrictEqual(
			selectIgnoredPaths(listing, ["scratchpad/**", "**/.DS_Store"]),
			[".DS_Store", "scratchpad", "src/.DS_Store"],
		);
	});

	it("returns nothing without patterns", () => {
		assert.deepStrictEqual(selectIgnoredPaths(listing, []), []);
	});
});

describe("isLegacyRegexIgnorePattern", () => {
	it("flags pre-0.3.4 regex-style ignore strings", () => {
		assert.isTrue(isLegacyRegexIgnorePattern("(^|/)scratchpad(/|$)"));
		assert.isFalse(isLegacyRegexIgnorePattern("scratchpad/**"));
	});
});
