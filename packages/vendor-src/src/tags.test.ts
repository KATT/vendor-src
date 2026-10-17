import { describe, expect, it } from "vite-plus/test";

import {
	candidateTags,
	newestMatchingTag,
	parseLsRemoteHead,
	parseLsRemoteTags,
	parseVersionedTag,
	pickTag,
	unscopedName,
} from "./tags.ts";

describe(unscopedName, () => {
	it("strips the scope", () => {
		expect(unscopedName("@effect/platform-node")).toBe("platform-node");
		expect(unscopedName("effect")).toBe("effect");
	});
});

describe(candidateTags, () => {
	it("includes package@version forms used by Effect", () => {
		expect(candidateTags("effect", "4.0.1")).toEqual([
			"effect@4.0.1",
			"effect@v4.0.1",
			"v4.0.1",
			"4.0.1",
		]);
	});
});

describe(parseLsRemoteTags, () => {
	it("drops peeled refs", () => {
		const stdout = `
abc\trefs/tags/effect@4.0.1
def\trefs/tags/effect@4.0.1^{}
ghi\trefs/tags/v4.0.0
`;
		expect(parseLsRemoteTags(stdout)).toEqual(["effect@4.0.1", "v4.0.0"]);
	});
});

describe(pickTag, () => {
	it("prefers package@version", () => {
		expect(
			pickTag(["effect@4.0.1", "v4.0.1", "4.0.1"], "effect", "4.0.1"),
		).toBe("effect@4.0.1");
	});

	it("matches prefix/version tags", () => {
		expect(pickTag(["npm/1.45.0", "npm/1.46.0"], "convex", "1.46.0")).toBe(
			"npm/1.46.0",
		);
	});

	it("returns undefined when nothing matches", () => {
		expect(pickTag(["other@1.0.0"], "effect", "4.0.1")).toBeUndefined();
	});
});

describe(parseVersionedTag, () => {
	it("splits the prefix from the version", () => {
		expect(parseVersionedTag("effect@4.0.1")).toEqual({
			prefix: "effect@",
			version: "4.0.1",
		});
		expect(parseVersionedTag("@effect/platform-node@4.0.0-beta.2")).toEqual({
			prefix: "@effect/platform-node@",
			version: "4.0.0-beta.2",
		});
		expect(parseVersionedTag("v1.2.3")).toEqual({
			prefix: "v",
			version: "1.2.3",
		});
		expect(parseVersionedTag("release-10.2.3")).toEqual({
			prefix: "release-",
			version: "10.2.3",
		});
		expect(parseVersionedTag("refs/tags/1.2.3")).toEqual({
			prefix: "",
			version: "1.2.3",
		});
	});

	it("rejects refs without a semver version", () => {
		expect(parseVersionedTag("main")).toBeUndefined();
		expect(parseVersionedTag("v1.2")).toBeUndefined();
		expect(parseVersionedTag("nightly")).toBeUndefined();
	});
});

describe(newestMatchingTag, () => {
	const tags = [
		"orpc@1.0.0",
		"orpc@1.10.0",
		"orpc@1.9.0",
		"orpc@2.0.0-beta.1",
		"@orpc/client@3.0.0",
		"orpc@v9.0.0",
		"v5.0.0",
	];

	it("picks the highest stable tag with the same prefix", () => {
		expect(newestMatchingTag(tags, "orpc@1.0.0")).toBe("orpc@1.10.0");
		expect(newestMatchingTag(tags, "v1.0.0")).toBe("v5.0.0");
		expect(newestMatchingTag(tags, "refs/tags/orpc@1.0.0")).toBe("orpc@1.10.0");
	});

	it("only considers prereleases from a prerelease", () => {
		expect(newestMatchingTag(tags, "orpc@2.0.0-alpha.0")).toBe(
			"orpc@2.0.0-beta.1",
		);
	});

	it("returns undefined for unversioned refs or no matches", () => {
		expect(newestMatchingTag(tags, "main")).toBeUndefined();
		expect(newestMatchingTag(tags, "lib@1.0.0")).toBeUndefined();
	});
});

describe(parseLsRemoteHead, () => {
	it("reads the HEAD commit", () => {
		const sha = "0123456789abcdef0123456789abcdef01234567";
		expect(parseLsRemoteHead(`${sha.toUpperCase()}\tHEAD\n`)).toBe(sha);
		expect(parseLsRemoteHead("")).toBeUndefined();
	});
});
