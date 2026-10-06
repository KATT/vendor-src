import { defineConfig } from "vite-plus";

export default defineConfig({
	fmt: {
		useTabs: true,
		printWidth: 80,
		sortPackageJson: false,
		ignorePatterns: [
			".all-contributorsrc",
			".husky/**",
			"coverage/**",
			"dist/**",
			"pnpm-lock.yaml",
			"repos/**",
		],
	},
	pack: {
		entry: ["src/bin.ts", "src/index.ts"],
		unbundle: true,
	},
	test: {
		clearMocks: true,
		coverage: {
			include: ["src"],
			reporter: ["html", "lcov"],
		},
		exclude: ["dist", "node_modules", "repos"],
	},
});
