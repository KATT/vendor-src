import { describe, expect, it } from "vite-plus/test";

import {
	AGENTS_END,
	AGENTS_START,
	renderAgentsBlock,
	renderVendorDirAgentsMd,
	upsertAgentsBlock,
} from "./agentsMd.ts";

describe(renderAgentsBlock, () => {
	it("stays concise and uses the configured dir", () => {
		const block = renderAgentsBlock(
			[{ name: "effect", package: "effect", path: "vendor/effect" }],
			"vendor",
		);
		expect(block).toContain(AGENTS_START);
		expect(block).toContain("`vendor/AGENTS.md`");
		expect(block).toContain("`vendor/effect`");
		expect(block).not.toContain("Keep tooling out of vendored trees");
		expect(block.split("\n").length).toBeLessThan(12);
	});
});

describe(renderVendorDirAgentsMd, () => {
	it("documents checkouts for the configured dir", () => {
		const md = renderVendorDirAgentsMd(
			[
				{
					name: "effect",
					package: "effect",
					path: "repos/effect",
					version: "4.0.1",
					ref: "effect@4.0.1",
				},
			],
			"repos",
		);
		expect(md).toContain("# Vendored repositories");
		expect(md).toContain("`repos/`");
		expect(md).toContain("`effect/` — `effect` @4.0.1 (`effect@4.0.1`)");
		expect(md).toContain("vendor-src.json");
	});
});

describe(upsertAgentsBlock, () => {
	it("creates a file when none exists", () => {
		const result = upsertAgentsBlock(undefined, [
			{ name: "effect", package: "effect", path: "repos/effect" },
		]);
		expect(result).toContain(AGENTS_START);
		expect(result).toContain(AGENTS_END);
		expect(result).toContain("`repos/effect`");
		expect(result).toContain("`effect`");
		expect(result).toContain("repos/AGENTS.md");
	});

	it("replaces an existing managed block", () => {
		const existing = `# Project

<!-- vendor-src:start -->
old
<!-- vendor-src:end -->

## More
`;
		const result = upsertAgentsBlock(existing, [
			{ name: "effect", package: "effect", path: "repos/effect" },
		]);
		expect(result).toContain("# Project");
		expect(result).toContain("## More");
		expect(result).not.toContain("old");
		expect(result).toContain("`repos/effect`");
	});
});
