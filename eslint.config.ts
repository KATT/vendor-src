import eslint from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
	globalIgnores(
		["**/*.snap", "coverage", "dist", "node_modules", "pnpm-lock.yaml"],
		"Global Ignores",
	),
	{ linterOptions: { reportUnusedDisableDirectives: "error" } },
	{
		extends: [
			eslint.configs.recommended,
			tseslint.configs.strictTypeChecked,
			tseslint.configs.stylisticTypeChecked,
		],
		files: ["**/*.{js,ts}"],
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["*.config.*s", "./lib/bin.js"],
				},
			},
		},
	},
	{
		extends: [vitest.configs.recommended],
		files: ["**/*.test.*"],
		rules: {
			"@typescript-eslint/no-unsafe-assignment": "off",
			"vitest/prefer-describe-function-title": "error",
		},
		settings: { vitest: { typecheck: true } },
	},
);
