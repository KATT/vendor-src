import { describe, expect, it } from "vitest";

import { compareSemver, maxSemver, parseSemver } from "./semver.ts";

describe("parseSemver", () => {
	it("parses release versions", () => {
		expect(parseSemver("4.0.1")).toEqual({
			major: 4,
			minor: 0,
			patch: 1,
			prerelease: [],
		});
	});

	it("parses prerelease versions", () => {
		expect(parseSemver("4.0.0-rc.118")).toEqual({
			major: 4,
			minor: 0,
			patch: 0,
			prerelease: ["rc", 118],
		});
	});
});

describe(compareSemver, () => {
	it("orders releases ahead of prereleases", () => {
		expect(compareSemver("4.0.0", "4.0.0-rc.118")).toBeGreaterThan(0);
		expect(compareSemver("4.0.0-rc.118", "4.0.0")).toBeLessThan(0);
	});

	it("compares patch numbers", () => {
		expect(compareSemver("4.0.1", "4.0.0")).toBeGreaterThan(0);
	});
});

describe(maxSemver, () => {
	it("returns the highest version when multiple are installed", () => {
		expect(maxSemver(["4.0.0-rc.118", "4.0.1", "3.19.0"])).toBe("4.0.1");
	});

	it("returns undefined for an empty list", () => {
		expect(maxSemver([])).toBeUndefined();
	});
});
