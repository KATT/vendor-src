import { defineConfig } from "vite-plus";

export default defineConfig({
	defaultPackage: {
		pack: "./packages/vendor-src",
		test: "./packages/vendor-src",
	},
	fmt: {
		useTabs: true,
		printWidth: 80,
		sortPackageJson: false,
		ignorePatterns: [
			".husky/**",
			"coverage/**",
			"**/dist/**",
			"pnpm-lock.yaml",
			"repos/**",
		],
	},
});
