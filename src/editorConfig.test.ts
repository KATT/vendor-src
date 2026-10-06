import { describe, expect, it } from "vite-plus/test";

import {
	mergeIgnoreFile,
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
	it("writes the same pattern into formatter/linter ignore files", () => {
		const merged = mergeToolingIgnoreFiles(
			{ ".prettierignore": "coverage/\n" },
			"repos",
		);
		expect(merged[".prettierignore"]).toContain("repos/");
		expect(merged[".eslintignore"]).toBe("repos/\n");
		expect(merged[".ignore"]).toBe("repos/\n");
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
