import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import {
	mergeIgnoreFile,
	mergeOxfmtConfig,
	mergeToolingIgnoreFiles,
	mergeVsCodeSettings,
} from "./editorConfig.ts";

describe("mergeIgnoreFile", () => {
	it("appends the vendor dir once", () => {
		assert.strictEqual(mergeIgnoreFile(undefined, "repos"), "repos/\n");
		assert.strictEqual(mergeIgnoreFile("dist/\n", "repos"), "dist/\nrepos/\n");
		assert.strictEqual(mergeIgnoreFile("repos/\n", "repos"), "repos/\n");
		assert.strictEqual(mergeIgnoreFile("repos", "repos"), "repos\n");
	});
});

describe("mergeToolingIgnoreFiles", () => {
	it("only updates existing Prettier/ESLint ignore files", () => {
		assert.deepStrictEqual(mergeToolingIgnoreFiles({}, "repos"), {});
		assert.deepStrictEqual(
			mergeToolingIgnoreFiles(
				{ ".prettierignore": "coverage/\n", ".eslintignore": "" },
				"repos",
			),
			{ ".prettierignore": "coverage/\nrepos/\n", ".eslintignore": "repos/\n" },
		);
	});
});

describe("mergeOxfmtConfig", () => {
	it.effect("creates a config when none exists", () =>
		Effect.gen(function* () {
			assert.deepStrictEqual(
				JSON.parse(yield* mergeOxfmtConfig(undefined, "repos")),
				{ ignorePatterns: ["repos/"] },
			);
		}),
	);

	it.effect("adds ignorePatterns without dropping other oxfmt settings", () =>
		Effect.gen(function* () {
			const merged = JSON.parse(
				yield* mergeOxfmtConfig('{\n\t"useTabs": true\n}\n', "repos"),
			);
			assert.deepStrictEqual(merged, {
				useTabs: true,
				ignorePatterns: ["repos/"],
			});
		}),
	);

	it.effect("preserves JSONC when repos is already ignored", () =>
		Effect.gen(function* () {
			const existing = `{
  // keep me
  "ignorePatterns": [
    "dist/**",
    "repos/**"
  ]
}
`;
			assert.strictEqual(yield* mergeOxfmtConfig(existing, "repos"), existing);
		}),
	);

	it.effect("parses JSONC when a new ignore must be added", () =>
		Effect.gen(function* () {
			const existing = `{
  // keep schema
  "$schema": "./schema.json",
  "ignorePatterns": ["dist/**"],
}
`;
			const merged = yield* mergeOxfmtConfig(existing, "repos");
			assert.deepStrictEqual(JSON.parse(merged), {
				$schema: "./schema.json",
				ignorePatterns: ["dist/**", "repos/"],
			});
			assert.include(merged, '\n  "$schema"');
		}),
	);

	it.effect("fails with ConfigFileError on invalid JSON", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(mergeOxfmtConfig("{ nope", "repos"));
			assert.strictEqual(error._tag, "ConfigFileError");
			assert.strictEqual(error.file, ".oxfmtrc.json");
			assert.include(error.message, ".oxfmtrc.json could not be parsed");
		}),
	);
});

describe("mergeVsCodeSettings", () => {
	it.effect("adds exclude patterns", () =>
		Effect.gen(function* () {
			const merged = JSON.parse(yield* mergeVsCodeSettings(undefined, "repos"));
			assert.deepStrictEqual(merged, {
				"typescript.preferences.autoImportFileExcludePatterns": ["repos/**"],
				"javascript.preferences.autoImportFileExcludePatterns": ["repos/**"],
				"files.exclude": { "repos/**": true },
				"files.watcherExclude": { "repos/**": true },
				"search.exclude": { "repos/**": true },
			});
		}),
	);

	it.effect("keeps unrelated settings", () =>
		Effect.gen(function* () {
			const merged = JSON.parse(
				yield* mergeVsCodeSettings(
					'{ "editor.tabSize": 2, "files.exclude": { "dist": true } }',
					"repos",
				),
			);
			assert.strictEqual(merged["editor.tabSize"], 2);
			assert.deepStrictEqual(merged["files.exclude"], {
				dist: true,
				"repos/**": true,
			});
		}),
	);

	it.effect("preserves existing settings when unchanged", () =>
		Effect.gen(function* () {
			const existing = `{
	"files.exclude": {
		"repos/**": true
	},
	"typescript.preferences.autoImportFileExcludePatterns": ["repos/**"],
	"javascript.preferences.autoImportFileExcludePatterns": ["repos/**"],
	"files.watcherExclude": {
		"repos/**": true
	},
	"search.exclude": {
		"repos/**": true
	}
}
`;
			assert.strictEqual(
				yield* mergeVsCodeSettings(existing, "repos"),
				existing,
			);
		}),
	);
});
