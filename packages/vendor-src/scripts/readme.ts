#!/usr/bin/env node
/**
 * Regenerate the command reference in the root README.md from the CLI's help.
 * `src/readme.test.ts` fails when the committed README is out of date.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";

import {
	renderCommandReference,
	replaceCommandReference,
} from "../src/readme.ts";

const readmePath = join(import.meta.dirname, "..", "..", "..", "README.md");

const reference = await Effect.runPromise(
	renderCommandReference.pipe(Effect.provide(NodeServices.layer)),
);
const readme = readFileSync(readmePath, "utf8");
const updated = replaceCommandReference(readme, reference);
if (updated === readme) {
	console.log("README.md command reference is up to date");
} else {
	writeFileSync(readmePath, updated);
	console.log("updated README.md command reference");
}
