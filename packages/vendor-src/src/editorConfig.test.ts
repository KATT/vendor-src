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
	it("only updates existing Prettier/ESLint ignore files", () => {
		expect(mergeToolingIgnoreFiles({}, "repos")).toEqual({});

		const withLegacy = mergeToolingIgnoreFiles(
			{ ".prettierignore": "coverage/\n", ".eslintignore": "" },
			"repos",
		);
		expect(withLegacy[".prettierignore"]).toContain("repos/");
		expect(withLegacy[".eslintignore"]).toBe("repos/\n");
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
	it("adds exclude patterns", () => {
		const merged = JSON.parse(mergeVsCodeSettings(undefined, "repos")) as {
			"files.exclude": Record<string, boolean>;
		};
		expect(merged["files.exclude"]["repos/**"]).toBe(true);
	});

	it("preserves existing settings when unchanged", () => {
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
		expect(mergeVsCodeSettings(existing, "repos")).toBe(existing);
	});
});
