import { describe, expect, it } from "vite-plus/test";

import {
	AGENTS_END,
	AGENTS_START,
	removeAgentsBlock,
	renderAgentsBlock,
	renderVendorDirAgentsMd,
	upsertAgentsBlock,
} from "./agentsMd.ts";

const effectRepo = {
	name: "effect",
	packages: ["effect"],
	path: ".repos/effect",
	version: "4.0.1",
	ref: "effect@4.0.1",
};

describe(renderAgentsBlock, () => {
	it("keeps usage + inventory at root; no repeated per-package hints", () => {
		const block = renderAgentsBlock(
			[
				{
					name: "effect",
					packages: ["effect"],
					path: "vendor/effect",
					version: "4.0.1",
				},
			],
			"vendor",
		);
		expect(block).toContain(AGENTS_START);
		expect(block).toContain("## Vendored Source");
		expect(block).toContain("### Vendored packages");
		expect(block).toContain("`vendor/AGENTS.md`");
		expect(block).toContain("- `effect@4.0.1` → `vendor/effect`");
		expect(block).not.toContain("idiomatic usage");
		expect(block).not.toContain("Don't edit");
		expect(block).not.toContain("Don't import");
		// blank line before the package list
		expect(block).toMatch(/### Vendored packages\n\n- /);
	});

	it("explains empty inventory without a packages subtitle", () => {
		const block = renderAgentsBlock([], ".repos");
		expect(block).toContain("Nothing is vendored yet");
		expect(block).not.toContain("### Vendored packages");
	});

	it("lists git-only checkouts by name and ref", () => {
		const block = renderAgentsBlock(
			[
				{
					name: "orpc",
					packages: [],
					path: ".repos/orpc",
					version: "v1.15.5",
					ref: "v1.15.5",
				},
			],
			".repos",
		);
		expect(block).toContain("- `orpc` (ref `v1.15.5`) → `.repos/orpc`");
	});
});

describe(renderVendorDirAgentsMd, () => {
	it("puts don'ts and checkout list in the vendor dir file", () => {
		const md = renderVendorDirAgentsMd([effectRepo], ".repos");
		expect(md).toContain("# Vendored Source");
		expect(md).toContain("## Don'ts");
		expect(md).toContain("Don't edit");
		expect(md).toContain("Don't import from `.repos/`");
		expect(md).toContain("## Vendored packages");
		expect(md).toContain("- `effect/` — `effect@4.0.1`");
		expect(md).not.toContain("idiomatic usage");
		expect(md).not.toMatch(/tag `/);
		expect(md).toContain("vendor-src.json");
	});

	it("omits redundant ref when it matches package@version", () => {
		const md = renderVendorDirAgentsMd(
			[{ ...effectRepo, ref: "v4.0.1" }],
			".repos",
		);
		expect(md).toContain("- `effect/` — `effect@4.0.1` (ref `v4.0.1`)");
	});
});

describe("monorepo checkouts", () => {
	const router = {
		name: "router",
		packages: ["@tanstack/react-start", "@tanstack/react-router"],
		path: ".repos/router",
		version: "1.168.60",
		ref: "@tanstack/react-start@1.168.60",
	};

	it("lists every package in the checkout, pinned one first", () => {
		expect(renderAgentsBlock([router], ".repos")).toContain(
			"- `@tanstack/react-start@1.168.60`, `@tanstack/react-router` → `.repos/router`",
		);
		const md = renderVendorDirAgentsMd([router], ".repos");
		expect(md).toContain(
			"- `router/` — `@tanstack/react-start@1.168.60`, `@tanstack/react-router`",
		);
		expect(md).toContain("share one checkout");
	});

	it("explains shared checkouts only when there is one", () => {
		const md = renderVendorDirAgentsMd(
			[{ ...router, packages: ["@tanstack/react-start"] }],
			".repos",
		);
		expect(md).not.toContain("share one checkout");
	});
});

describe(upsertAgentsBlock, () => {
	it("creates a file when none exists", () => {
		const result = upsertAgentsBlock(
			undefined,
			[{ name: "effect", packages: ["effect"], path: ".repos/effect" }],
			".repos",
		);
		expect(result).toContain(AGENTS_START);
		expect(result).toContain(AGENTS_END);
		expect(result).toContain("- `effect` → `.repos/effect`");
		expect(result).toContain("`.repos/AGENTS.md`");
	});

	it("replaces an existing managed block", () => {
		const existing = `# Project

<!-- vendor-src:start -->
old
<!-- vendor-src:end -->

## More
`;
		const result = upsertAgentsBlock(
			existing,
			[{ name: "effect", packages: ["effect"], path: ".repos/effect" }],
			".repos",
		);
		expect(result).toContain("# Project");
		expect(result).toContain("## More");
		expect(result).not.toContain("old");
		expect(result).toContain("`.repos/effect`");
	});

	it("does not introduce leading blank lines when the block is the whole file", () => {
		const existing = `${AGENTS_START}
old
${AGENTS_END}
`;
		const result = upsertAgentsBlock(
			existing,
			[
				{
					name: "effect",
					packages: ["effect"],
					path: ".repos/effect",
					version: "4.0.1",
				},
			],
			".repos",
		);
		expect(result.startsWith(AGENTS_START)).toBe(true);
	});
});

describe(removeAgentsBlock, () => {
	const repos = [
		{ name: "effect", packages: ["effect"], path: ".repos/effect" },
	];

	it("removes a trailing block", () => {
		const existing = "# Project\n\nIntro.\n";
		expect(
			removeAgentsBlock(upsertAgentsBlock(existing, repos, ".repos")),
		).toBe(existing);
	});

	it("removes a block in the middle and keeps surrounding content", () => {
		const block = renderAgentsBlock(repos, ".repos");
		expect(
			removeAgentsBlock(`# Project\n\nIntro.\n\n${block}\n\n## More\n`),
		).toBe("# Project\n\nIntro.\n\n## More\n");
	});

	it("returns an empty file when only the block was there", () => {
		expect(
			removeAgentsBlock(upsertAgentsBlock(undefined, repos, ".repos")),
		).toBe("");
	});

	it("leaves content without a block unchanged", () => {
		expect(removeAgentsBlock("# Project\n")).toBe("# Project\n");
	});
});
