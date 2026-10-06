import { describe, expect, it } from "vitest";

import { findDrift, parseManifest } from "./manifest.ts";

describe(findDrift, () => {
	it("reports version mismatches", () => {
		const manifest = parseManifest(
			JSON.stringify({
				dir: "repos",
				repos: {
					effect: {
						package: "effect",
						url: "https://github.com/Effect-TS/effect.git",
						version: "4.0.0",
						ref: "effect@4.0.0",
					},
				},
			}),
		);
		const drifts = findDrift(manifest, new Map([["effect", "4.0.1"]]));
		expect(drifts).toEqual([
			{
				name: "effect",
				package: "effect",
				vendored: "4.0.0",
				installed: "4.0.1",
			},
		]);
	});
});
