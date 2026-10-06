import { describe, expect, it } from "vite-plus/test";

import { toFetchRef } from "./git.ts";

describe(toFetchRef, () => {
	it("prefixes tags that contain @", () => {
		expect(toFetchRef("effect@4.0.1")).toBe("refs/tags/effect@4.0.1");
	});

	it("leaves fully-qualified refs alone", () => {
		expect(toFetchRef("refs/tags/effect@4.0.1")).toBe("refs/tags/effect@4.0.1");
		expect(toFetchRef("refs/heads/main")).toBe("refs/heads/main");
	});
});
