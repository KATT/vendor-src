import {
	lstatSync,
	mkdtempSync,
	readFileSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { emptyManifest, type VendorSrcManifest } from "./manifest.ts";
import { updateAgentsMd } from "./project.ts";

const temps: string[] = [];

afterEach(() => {
	for (const dir of temps.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function runUpdate(projectRoot: string, manifest: VendorSrcManifest) {
	return Effect.runPromise(
		updateAgentsMd(projectRoot, manifest).pipe(
			Effect.provide(NodeServices.layer),
		),
	);
}

describe(updateAgentsMd, () => {
	it("writes the managed block through an AGENTS.md → README.md symlink", async () => {
		const root = mkdtempSync(join(tmpdir(), "vendor-src-agents-symlink-"));
		temps.push(root);

		writeFileSync(join(root, "README.md"), "# Toy projects\n\nHello.\n");
		symlinkSync("README.md", join(root, "AGENTS.md"));

		const manifest: VendorSrcManifest = {
			...emptyManifest(),
			repos: {
				effect: {
					package: "effect",
					url: "https://github.com/Effect-TS/effect.git",
					version: "4.0.1",
					ref: "effect@4.0.1",
				},
			},
		};

		await runUpdate(root, manifest);

		expect(lstatSync(join(root, "AGENTS.md")).isSymbolicLink()).toBe(true);
		expect(readlinkSync(join(root, "AGENTS.md"))).toBe("README.md");

		const readme = readFileSync(join(root, "README.md"), "utf8");
		expect(readme).toContain("# Toy projects");
		expect(readme).toContain("<!-- vendor-src:start -->");
		expect(readme).toContain("- `effect@4.0.1` → `repos/effect`");
		expect(readme).toContain("### Vendored packages");
		expect(readme).toContain("<!-- vendor-src:end -->");

		const vendorAgents = readFileSync(join(root, "repos", "AGENTS.md"), "utf8");
		expect(vendorAgents).toContain("## Don'ts");
		expect(vendorAgents).toContain("`effect@4.0.1`");
	});

	it("creates AGENTS.md when missing", async () => {
		const root = mkdtempSync(join(tmpdir(), "vendor-src-agents-create-"));
		temps.push(root);

		await runUpdate(root, emptyManifest());

		const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
		expect(agents).toContain("<!-- vendor-src:start -->");
		expect(agents).toContain("## Vendored Source");
	});
});
