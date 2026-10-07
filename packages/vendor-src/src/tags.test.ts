import { describe, expect, it } from "vite-plus/test";

import {
	candidateTags,
	parseLsRemoteTags,
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
