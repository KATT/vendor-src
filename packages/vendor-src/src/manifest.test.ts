import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import {
	decodeManifest,
	emptyManifest,
	encodeManifest,
	findDrift,
	MANIFEST_SCHEMA_URL,
	removeRepo,
	repoPrefix,
	setRepo,
	vendorDir,
} from "./manifest.ts";

const effectRepo = {
	package: "effect",
	url: "https://github.com/Effect-TS/effect.git",
	version: "4.0.1",
	ref: "effect@4.0.1",
};

describe("decodeManifest", () => {
	it.effect("defaults $schema, dir, and repos", () =>
		Effect.gen(function* () {
			const manifest = yield* decodeManifest("{}");
			assert.deepStrictEqual(manifest, emptyManifest());
		}),
	);

	it.effect("keeps per-repo ignore and drops legacy top-level ignore", () =>
		Effect.gen(function* () {
			const manifest = yield* decodeManifest(
				JSON.stringify({
					dir: "repos",
					ignore: ["docs/**"],
					repos: { effect: { ...effectRepo, ignore: ["scratchpad"] } },
				}),
			);
			assert.strictEqual(manifest.$schema, MANIFEST_SCHEMA_URL);
			assert.notProperty(manifest, "ignore");
			assert.deepStrictEqual(manifest.repos.effect?.ignore, ["scratchpad"]);
		}),
	);

	it.effect("rejects repos with missing fields", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				decodeManifest(
					JSON.stringify({ repos: { effect: { package: "effect" } } }),
				),
			);
			assert.strictEqual(error._tag, "ManifestError");
			assert.include(error.message, "vendor-src.json is invalid");
			assert.include(error.message, "url");
		}),
	);

	it.effect("rejects malformed JSON", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(decodeManifest("{"));
			assert.strictEqual(error._tag, "ManifestError");
		}),
	);
});

describe("encodeManifest", () => {
	it.effect("writes tab-indented JSON in a stable key order", () =>
		Effect.gen(function* () {
			const json = yield* encodeManifest(
				setRepo(emptyManifest(), "effect", effectRepo),
			);
			assert.strictEqual(
				json,
				`${JSON.stringify(
					{
						$schema: MANIFEST_SCHEMA_URL,
						dir: "repos",
						repos: { effect: effectRepo },
					},
					null,
					"\t",
				)}\n`,
			);
		}),
	);

	it.effect("round-trips through decodeManifest", () =>
		Effect.gen(function* () {
			const manifest = setRepo(emptyManifest(), "effect", {
				...effectRepo,
				ignore: ["docs/**"],
			});
			const decoded = yield* decodeManifest(yield* encodeManifest(manifest));
			assert.deepStrictEqual(decoded, manifest);
		}),
	);
});

describe("setRepo / removeRepo", () => {
	it("omits empty ignore arrays", () => {
		const manifest = setRepo(emptyManifest(), "effect", {
			...effectRepo,
			ignore: [],
		});
		assert.notProperty(manifest.repos.effect, "ignore");
	});

	it("does not mutate the input manifest", () => {
		const before = emptyManifest();
		const added = setRepo(before, "effect", effectRepo);
		assert.deepStrictEqual(before.repos, {});
		assert.deepStrictEqual(removeRepo(added, "effect").repos, {});
		assert.property(added.repos, "effect");
	});
});

describe("vendorDir", () => {
	it("strips trailing slashes", () => {
		const manifest = { ...emptyManifest(), dir: "vendor/" };
		assert.strictEqual(vendorDir(manifest), "vendor");
		assert.strictEqual(repoPrefix(manifest, "effect"), "vendor/effect");
	});
});

describe("findDrift", () => {
	it("reports version mismatches and missing installs", () => {
		const manifest = setRepo(
			setRepo(emptyManifest(), "effect", { ...effectRepo, version: "4.0.0" }),
			"other",
			{ ...effectRepo, package: "other" },
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
