import { describe, expect, it } from "vite-plus/test";

import {
	mergeIgnoreFile,
	mergeOxfmtConfig,
	mergeToolingIgnoreFiles,
	mergeVsCodeSettings,
} from "./editorConfig.ts";

describe(mergeIgnoreFile, () => {
	it("appends the vendor dir once", () => {
		expect(mergeIgnoreFile(undefined, "repos")).toBe("repos/\n");
		expect(mergeIgnoreFile("dist/\n", "repos")).toBe("dist/\nrepos/\n");
		expect(mergeIgnoreFile("repos/\n", "repos")).toBe("repos/\n");
	});
});

describe(mergeToolingIgnoreFiles, () => {
	it("always writes .ignore and only updates existing legacy ignore files", () => {
		const withoutLegacy = mergeToolingIgnoreFiles({}, "repos");
		expect(withoutLegacy[".ignore"]).toBe("repos/\n");
		expect(withoutLegacy[".prettierignore"]).toBeUndefined();
		expect(withoutLegacy[".eslintignore"]).toBeUndefined();

		const withLegacy = mergeToolingIgnoreFiles(
			{ ".prettierignore": "coverage/\n", ".eslintignore": "" },
			"repos",
		);
		expect(withLegacy[".prettierignore"]).toContain("repos/");
		expect(withLegacy[".eslintignore"]).toBe("repos/\n");
		expect(withLegacy[".ignore"]).toBe("repos/\n");
	});
});

describe(mergeOxfmtConfig, () => {
	it("adds ignorePatterns without dropping other oxfmt settings", () => {
		const merged = JSON.parse(
			mergeOxfmtConfig('{\n\t"useTabs": true\n}\n', "repos"),
		) as { useTabs: boolean; ignorePatterns: string[] };
		expect(merged.useTabs).toBe(true);
		expect(merged.ignorePatterns).toContain("repos/");
	});

	it("preserves JSONC when repos is already ignored", () => {
		const existing = `{
  // keep me
  "ignorePatterns": [
    "dist/**",
    "repos/**"
  ]
}
`;
		expect(mergeOxfmtConfig(existing, "repos")).toBe(existing);
	});

	it("parses JSONC when a new ignore must be added", () => {
		const existing = `{
  // keep schema
  "$schema": "./schema.json",
  "ignorePatterns": ["dist/**"]
}
`;
		const merged = JSON.parse(mergeOxfmtConfig(existing, "repos")) as {
			$schema: string;
			ignorePatterns: string[];
		};
		expect(merged.$schema).toBe("./schema.json");
		expect(merged.ignorePatterns).toEqual(["dist/**", "repos/"]);
	});
});

describe(mergeVsCodeSettings, () => {
	it("excludes the vendor dir from search and auto-imports", () => {
		const settings = JSON.parse(mergeVsCodeSettings(undefined, "repos")) as {
			"search.exclude": Record<string, boolean>;
			"typescript.preferences.autoImportFileExcludePatterns": string[];
		};
		expect(settings["search.exclude"]["repos/**"]).toBe(true);
		expect(
			settings["typescript.preferences.autoImportFileExcludePatterns"],
		).toContain("repos/**");
	});
});
