import { describe, expect, it } from "vitest";

import { AGENTS_END, AGENTS_START, upsertAgentsBlock } from "./agentsMd.ts";

describe(upsertAgentsBlock, () => {
	it("creates a file when none exists", () => {
		const result = upsertAgentsBlock(undefined, [
			{ name: "effect", package: "effect", path: "repos/effect" },
		]);
		expect(result).toContain(AGENTS_START);
		expect(result).toContain(AGENTS_END);
		expect(result).toContain("`repos/effect`");
		expect(result).toContain("`effect`");
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
