import { describe, expect, it } from "vitest";

import { normalizeRepositoryUrl } from "./repository.ts";

describe(normalizeRepositoryUrl, () => {
	it("normalizes git+https URLs", () => {
		expect(
			normalizeRepositoryUrl({
				type: "git",
				url: "git+https://github.com/Effect-TS/effect.git",
			}),
		).toBe("https://github.com/Effect-TS/effect.git");
	});

	it("normalizes github shorthand", () => {
		expect(normalizeRepositoryUrl("Effect-TS/effect")).toBe(
			"https://github.com/Effect-TS/effect.git",
		);
	});
});
