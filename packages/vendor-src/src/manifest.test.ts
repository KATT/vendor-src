import { readFileSync } from "node:fs";

import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
	decodeManifest,
	emptyManifest,
	encodeManifest,
	findDrift,
	Manifest,
	MANIFEST_SCHEMA_URL,
	removeRepo,
	repoPrefix,
	setRepo,
	VendoredRepo,
	type VendoredRepo as VendoredRepoType,
} from "./manifest.ts";

const effect: VendoredRepoType = {
	package: "effect",
	url: "https://github.com/Effect-TS/effect.git",
	version: "4.0.1",
	ref: "effect@4.0.1",
};

describe("decodeManifest", () => {
	it.effect("defaults $schema and drops legacy top-level ignore", () =>
		Effect.gen(function* () {
			const manifest = yield* decodeManifest(
				JSON.stringify({
					dir: "vendor",
					rootAgentsMd: false,
					ignore: ["docs/**"],
					repos: { effect: { ...effect, ignore: ["scratchpad"] } },
				}),
			);
			assert.strictEqual(manifest.$schema, MANIFEST_SCHEMA_URL);
			assert.strictEqual(manifest.dir, "vendor");
			assert.isFalse(manifest.rootAgentsMd);
			assert.notProperty(manifest, "ignore");
			assert.deepStrictEqual(manifest.repos.effect?.ignore, ["scratchpad"]);
		}),
	);

	it.effect("requires dir", () =>
		Effect.gen(function* () {
			const error = yield* decodeManifest(
				JSON.stringify({ rootAgentsMd: true, repos: {} }),
			).pipe(Effect.flip);
			assert.include(error.message, "vendor-src.json is invalid");
			assert.include(error.message, "dir");
		}),
	);

	it.effect("requires rootAgentsMd", () =>
		Effect.gen(function* () {
			const error = yield* decodeManifest(
				JSON.stringify({ dir: ".repos", repos: {} }),
			).pipe(Effect.flip);
			assert.include(error.message, "vendor-src.json is invalid");
			assert.include(error.message, "rootAgentsMd");
		}),
	);

	it.effect("fails with the file path when a repo is missing fields", () =>
		Effect.gen(function* () {
			const error = yield* decodeManifest(
				JSON.stringify({
					dir: ".repos",
					rootAgentsMd: true,
					repos: { effect: { package: "effect" } },
				}),
			).pipe(Effect.flip);
			assert.strictEqual(error._tag, "ManifestError");
			assert.include(error.message, "vendor-src.json is invalid");
			assert.include(error.message, "url");
		}),
	);

	it.effect("fails on malformed JSON", () =>
		Effect.gen(function* () {
			const error = yield* decodeManifest("{", "custom.json").pipe(Effect.flip);
			assert.include(error.message, "custom.json is invalid");
		}),
	);
});

describe("encodeManifest", () => {
	it.effect("round-trips with tabs and a trailing newline", () =>
		Effect.gen(function* () {
			const manifest = setRepo(emptyManifest, "effect", effect);
			const raw = encodeManifest(manifest);
			assert.isTrue(raw.endsWith("}\n"));
			assert.include(raw, '\n\t"dir": ".repos",\n\t"rootAgentsMd": true');
			assert.deepStrictEqual(yield* decodeManifest(raw), manifest);
		}),
	);
});

describe("setRepo / removeRepo", () => {
	it("omits empty ignore arrays and does not mutate the input", () => {
		const manifest = setRepo(emptyManifest, "effect", {
			...effect,
			ignore: [],
		});
		assert.deepStrictEqual(manifest.repos.effect, effect);
		assert.deepStrictEqual(emptyManifest.repos, {});
		assert.notInclude(encodeManifest(manifest), '"ignore"');

		const removed = removeRepo(manifest, "effect");
		assert.deepStrictEqual(removed.repos, {});
		assert.property(manifest.repos, "effect");
	});

	it("builds checkout prefixes without trailing slashes", () => {
		assert.strictEqual(
			repoPrefix({ ...emptyManifest, dir: "vendor/" }, "effect"),
			"vendor/effect",
		);
	});
});

describe("findDrift", () => {
	it("reports version mismatches and missing installs", () => {
		const manifest = setRepo(
			setRepo(emptyManifest, "effect", { ...effect, version: "4.0.0" }),
			"other",
			{ ...effect, package: "other" },
		);
		assert.deepStrictEqual(
			findDrift(manifest, new Map([["effect", "4.0.1"]])),
			[
				{
					name: "effect",
					package: "effect",
					vendored: "4.0.0",
					installed: "4.0.1",
				},
				{
					name: "other",
					package: "other",
					vendored: "4.0.1",
					installed: undefined,
				},
			],
		);
	});
});

describe("published JSON schema", () => {
	const jsonSchema = JSON.parse(
		readFileSync(
			new URL("../schema/vendor-src.schema.json", import.meta.url),
			"utf8",
		),
	) as {
		required: string[];
		properties: Record<string, unknown>;
		$defs: {
			vendoredRepo: { required: string[]; properties: Record<string, unknown> };
		};
	};

	it("describes the same fields as the Effect schema", () => {
		assert.deepStrictEqual(
			Object.keys(jsonSchema.properties).toSorted(),
			Object.keys(Manifest.fields).toSorted(),
		);
		assert.deepStrictEqual(
			Object.keys(jsonSchema.$defs.vendoredRepo.properties).toSorted(),
			Object.keys(VendoredRepo.fields).toSorted(),
		);
	});

	it("requires dir, rootAgentsMd and repos at the top level", () => {
		assert.deepStrictEqual(jsonSchema.required.toSorted(), [
			"dir",
			"repos",
			"rootAgentsMd",
		]);
		assert.isFalse(Schema.is(Manifest)({ rootAgentsMd: true, repos: {} }));
		assert.isFalse(Schema.is(Manifest)({ dir: ".repos", repos: {} }));
		assert.isTrue(Schema.is(Manifest)(emptyManifest));
	});

	it("requires the same repo fields as the Effect schema", () => {
		const required = Object.entries(VendoredRepo.fields)
			.filter(([key]) => {
				const withoutKey = { ...effect, ignore: ["x"] } as Record<
					string,
					unknown
				>;
				delete withoutKey[key];
				return !Schema.is(VendoredRepo)(withoutKey);
			})
			.map(([key]) => key);
		assert.deepStrictEqual(
			jsonSchema.$defs.vendoredRepo.required.toSorted(),
			required.toSorted(),
		);
	});
});
