import { describe, expect, it } from "vite-plus/test";

import {
	defaultCheckoutName,
	normalizeRepositoryUrl,
	repositoryDirectory,
	repositorySlug,
} from "./repository.ts";

describe(normalizeRepositoryUrl, () => {
	it("normalizes git+https URLs", () => {
		expect(
			normalizeRepositoryUrl({
				type: "git",
				url: "git+https://github.com/Effect-TS/effect.git",
			}),
		).toBe("https://github.com/Effect-TS/effect.git");
	});

	it("normalizes github shorthand", () => {
		expect(normalizeRepositoryUrl("Effect-TS/effect")).toBe(
			"https://github.com/Effect-TS/effect.git",
		);
	});
});

describe(repositoryDirectory, () => {
	it("normalizes repository.directory and ignores the repo root", () => {
		expect(repositoryDirectory({ url: "x", directory: "./packages/a/" })).toBe(
			"packages/a",
		);
		expect(repositoryDirectory({ url: "x", directory: "." })).toBeUndefined();
		expect(repositoryDirectory("github:org/repo")).toBeUndefined();
	});
});

describe(defaultCheckoutName, () => {
	const router = "https://github.com/TanStack/router.git";
	it("names monorepo checkouts after the repo", () => {
		expect(
			defaultCheckoutName({
				packageName: "@tanstack/react-start",
				url: router,
				directory: "packages/react-start",
			}),
		).toBe("router");
	});

	it("uses the unscoped package name otherwise", () => {
		expect(
			defaultCheckoutName({ packageName: "@scope/lib", url: router }),
		).toBe("lib");
	});

	it("formats owner/repo slugs", () => {
		expect(repositorySlug(router)).toBe("TanStack/router");
	});
});
