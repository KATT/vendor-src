import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import {
	COMMANDS_END,
	COMMANDS_START,
	renderCommandReference,
	replaceCommandReference,
} from "./readme.ts";

describe("README command reference", () => {
	it.effect("matches the CLI help (run `pnpm docs` to update)", () =>
		Effect.gen(function* () {
			const readme = readFileSync(
				join(import.meta.dirname, "..", "..", "..", "README.md"),
				"utf8",
			);
			const reference = yield* renderCommandReference;
			assert.strictEqual(replaceCommandReference(readme, reference), readme);
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it("replaces only the text between the markers", () => {
		const readme = `# Title\n\n${COMMANDS_START}\nold\n${COMMANDS_END}\n\nMore.\n`;
		assert.strictEqual(
			replaceCommandReference(readme, "new"),
			`# Title\n\n${COMMANDS_START}\n\nnew\n\n${COMMANDS_END}\n\nMore.\n`,
		);
		assert.throws(() => replaceCommandReference("# Title\n", "new"));
	});
});
