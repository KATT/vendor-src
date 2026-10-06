import { Console, Effect } from "effect";
import { Command, Flag } from "effect/cli";

import { resolveInstalledVersions } from "../installedVersions.ts";
import { findDrift } from "../manifest.ts";
import { findProjectRoot, readManifest } from "../project.ts";

export const checkCommand = Command.make(
	"check",
	{
		strict: Flag.Boolean("strict").pipe(
			Flag.withDescription(
				"Exit 1 when vendored versions drift from installed",
			),
			Flag.withDefault(false),
		),
	},
	Effect.fn(function* ({ strict }) {
		const projectRoot = yield* findProjectRoot;
		const manifest = yield* readManifest(projectRoot);
		const names = Object.values(manifest.repos).map((repo) => repo.package);
		if (names.length === 0) {
			return;
		}

		const installed = resolveInstalledVersions(names, projectRoot);
		const drifts = findDrift(manifest, installed);
		if (drifts.length === 0) {
			return;
		}

		for (const drift of drifts) {
			if (!drift.installed) {
				yield* Console.log(
					`vendor-src: ${drift.name} (${drift.package}) is vendored at ${drift.vendored} but is not installed`,
				);
			} else {
				yield* Console.log(
					`vendor-src: ${drift.name} is vendored at ${drift.vendored} but ${drift.package}@${drift.installed} is installed`,
				);
			}
		}
		yield* Console.log("Run `vendor-src sync` to update vendored sources.");

		if (strict) {
			return yield* Effect.fail(new Error("vendored sources are out of date"));
		}
	}),
).pipe(
	Command.withDescription(
		"Offline check that vendored repos match installed package versions",
	),
);
