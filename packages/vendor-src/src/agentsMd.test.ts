import { describe, expect, it } from "vite-plus/test";

import {
	AGENTS_END,
	AGENTS_START,
	renderAgentsBlock,
	renderVendorDirAgentsMd,
	upsertAgentsBlock,
} from "./agentsMd.ts";

const effectRepo = {
	name: "effect",
	package: "effect",
	path: "repos/effect",
	version: "4.0.1",
	ref: "effect@4.0.1",
};

describe(renderAgentsBlock, () => {
	it("keeps usage + inventory at root; no repeated per-package hints", () => {
		const block = renderAgentsBlock(
			[
				{
					name: "effect",
					package: "effect",
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
		const block = renderAgentsBlock([], "repos");
		expect(block).toContain("Nothing is vendored yet");
		expect(block).not.toContain("### Vendored packages");
	});
});

describe(renderVendorDirAgentsMd, () => {
	it("puts don'ts and checkout list in the vendor dir file", () => {
		const md = renderVendorDirAgentsMd([effectRepo], "repos");
		expect(md).toContain("# Vendored Source");
		expect(md).toContain("## Don'ts");
		expect(md).toContain("Don't edit");
		expect(md).toContain("Don't import from `repos/`");
		expect(md).toContain("## Vendored packages");
		expect(md).toContain("- `effect/` — `effect@4.0.1`");
		expect(md).not.toContain("idiomatic usage");
		expect(md).not.toMatch(/tag `/);
		expect(md).toContain("vendor-src.json");
	});

	it("omits redundant ref when it matches package@version", () => {
		const md = renderVendorDirAgentsMd(
			[{ ...effectRepo, ref: "v4.0.1" }],
			"repos",
		);
		expect(md).toContain("- `effect/` — `effect@4.0.1` (ref `v4.0.1`)");
	});
});

describe(upsertAgentsBlock, () => {
	it("creates a file when none exists", () => {
		const result = upsertAgentsBlock(undefined, [
			{ name: "effect", package: "effect", path: "repos/effect" },
		]);
		expect(result).toContain(AGENTS_START);
		expect(result).toContain(AGENTS_END);
		expect(result).toContain("- `effect` → `repos/effect`");
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

	it("does not introduce leading blank lines when the block is the whole file", () => {
		const existing = `${AGENTS_START}
old
${AGENTS_END}
`;
		const result = upsertAgentsBlock(existing, [
			{
				name: "effect",
				package: "effect",
				path: "repos/effect",
				version: "4.0.1",
			},
		]);
		expect(result.startsWith(AGENTS_START)).toBe(true);
	});
});
