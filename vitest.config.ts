import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		clearMocks: true,
		coverage: {
			include: ["src"],
			reporter: ["html", "lcov"],
		},
		exclude: ["dist", "node_modules", "repos"],
		setupFiles: ["console-fail-test/setup"],
	},
});
