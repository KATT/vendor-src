import { defineConfig } from "vite-plus";

export default defineConfig({
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
		exclude: ["dist", "node_modules"],
	},
});
