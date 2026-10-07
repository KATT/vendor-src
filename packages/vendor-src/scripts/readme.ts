#!/usr/bin/env node
/**
 * Regenerate the command reference in the root README.md from the CLI's help.
 * `src/readme.test.ts` fails when the committed README is out of date.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Path } from "effect";

import {
	renderCommandReference,
	replaceCommandReference,
} from "../src/readme.ts";

Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const readmePath = path.join(
		import.meta.dirname,
		"..",
		"..",
		"..",
		"README.md",
	);

	const readme = yield* fs.readFileString(readmePath);
	const updated = replaceCommandReference(
		readme,
		yield* renderCommandReference,
	);
	if (updated === readme) {
		yield* Console.log("README.md command reference is up to date");
	} else {
		yield* fs.writeFileString(readmePath, updated);
		yield* Console.log("updated README.md command reference");
	}
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
