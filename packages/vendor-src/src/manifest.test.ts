import { describe, expect, it } from "vite-plus/test";

import {
	findDrift,
	MANIFEST_SCHEMA_URL,
	parseManifest,
	stringifyManifest,
} from "./manifest.ts";

describe(parseManifest, () => {
	it("defaults $schema and drops legacy top-level ignore", () => {
		const manifest = parseManifest(
			JSON.stringify({
				dir: "repos",
				ignore: ["(^|/)docs(/|$)"],
				repos: {
					effect: {
						package: "effect",
						url: "https://github.com/Effect-TS/effect.git",
						version: "4.0.1",
						ref: "effect@4.0.1",
						ignore: ["(^|/)scratchpad(/|$)"],
					},
				},
			}),
		);
		expect(manifest.$schema).toBe(MANIFEST_SCHEMA_URL);
		expect(manifest).not.toHaveProperty("ignore");
		expect(manifest.repos.effect.ignore).toEqual(["(^|/)scratchpad(/|$)"]);
	});
});

describe(stringifyManifest, () => {
	it("writes $schema and omits empty per-repo ignore arrays", () => {
		const raw = stringifyManifest({
			dir: "repos",
			repos: {
				effect: {
					package: "effect",
					url: "https://github.com/Effect-TS/effect.git",
					version: "4.0.1",
					ref: "effect@4.0.1",
					ignore: [],
				},
			},
		});
		const parsed = JSON.parse(raw) as {
			$schema: string;
			repos: { effect: { ignore?: string[] } };
		};
		expect(parsed.$schema).toBe(MANIFEST_SCHEMA_URL);
		expect(parsed.repos.effect.ignore).toBeUndefined();
		expect(raw).not.toContain('"ignore"');
	});
});

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
