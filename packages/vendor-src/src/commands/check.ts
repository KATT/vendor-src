import { Console, Effect, Option } from "effect";
import { Command, Flag } from "effect/cli";

import { isLegacyRegexIgnorePattern } from "../ignore.ts";
import { findDrift, pinnedPackage, type Drift } from "../manifest.ts";
import { InstalledPackages } from "../packages.ts";
import { Project } from "../project.ts";
import { CommandError, reportErrors } from "./shared.ts";
import { syncRepos } from "./sync.ts";

const isCI = () => {
	const value = process.env.CI?.toLowerCase();
	return (
		value !== undefined && value !== "" && value !== "0" && value !== "false"
	);
};

/** Sync each drifted repo on its own; returns the drifts that remain. */
const syncDrifted = Effect.fnUntraced(function* (drifts: ReadonlyArray<Drift>) {
	if (isCI()) {
		yield* Console.error("vendor-src: not syncing in CI (CI is set).");
		return drifts;
	}
	const remaining: Drift[] = [];
	for (const drift of drifts) {
		if (drift.installed === undefined) {
			remaining.push(drift);
			continue;
		}
		const synced = yield* syncRepos([drift.name]).pipe(
			Effect.as(true),
			Effect.catch((error) =>
				Console.error(
					`vendor-src: could not sync ${drift.name}: ${error.message}`,
				).pipe(Effect.as(false)),
			),
		);
		if (!synced) {
			remaining.push(drift);
		}
	}
	return remaining;
});

export const checkCommand = Command.make(
	"check",
	{
		strict: Flag.Boolean("strict").pipe(
			Flag.withDescription(
				"Exit 1 when vendored versions drift from installed",
			),
			Flag.withDefault(false),
		),
		sync: Flag.Boolean("sync").pipe(
			Flag.withDescription(
				"Sync drifted repos (used by postinstall); falls back to a warning when that fails or CI is set",
			),
			Flag.withDefault(false),
		),
	},
	Effect.fn("vendor-src check")(function* ({ strict, sync }) {
		const project = yield* Project;
		const packages = yield* InstalledPackages;
		const manifest = yield* project.readManifest;

		for (const [name, repo] of Object.entries(manifest.repos)) {
			for (const pattern of repo.ignore ?? []) {
				if (isLegacyRegexIgnorePattern(pattern)) {
					yield* Console.error(
						`vendor-src: ${name} ignore pattern looks like a pre-0.3.4 regex; use globs (e.g. scratchpad/**): ${pattern}`,
					);
				}
			}
		}

		const installed = new Map<string, string>();
		for (const repo of Object.values(manifest.repos)) {
			const version = yield* packages.version(pinnedPackage(repo));
			if (Option.isSome(version)) {
				installed.set(pinnedPackage(repo), version.value);
			}
		}

		let drifts: ReadonlyArray<Drift> = findDrift(manifest, installed);
		if (drifts.length > 0 && sync) {
			drifts = yield* syncDrifted(drifts);
		}
		if (drifts.length === 0) {
			return;
		}
		for (const drift of drifts) {
			yield* Console.error(
				drift.installed === undefined
					? `vendor-src: ${drift.name} (${drift.package}) is vendored at ${drift.vendored} but is not installed`
					: `vendor-src: ${drift.name} is vendored at ${drift.vendored} but ${drift.package}@${drift.installed} is installed`,
			);
		}
		yield* Console.error("Run `vendor-src sync` to update vendored sources.");

		if (strict) {
			return yield* new CommandError({
				message: "vendored sources are out of date",
			});
		}
	}, reportErrors),
).pipe(
	Command.withDescription(
		"Offline check that vendored repos match installed package versions",
	),
);
