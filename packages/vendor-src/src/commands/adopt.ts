import { Console, Effect, Option } from "effect";
import { Argument, Command } from "effect/cli";

import { Git } from "../git.ts";
import { repoPrefix, setRepo, vendorDir } from "../manifest.ts";
import { Project } from "../project.ts";
import { defaultVendorName } from "../repository.ts";
import {
	checkoutExists,
	CommandError,
	ensureNotVendored,
	nameFlag,
	refFlag,
	reportErrors,
	resolveInstalledSource,
	writeProjectFiles,
} from "./shared.ts";

/**
 * Register an existing `{dir}/<name>` checkout in vendor-src.json without
 * running `git subtree add` (for manual subtrees or prior imports).
 */
export const adoptCommand = Command.make(
	"adopt",
	{
		target: Argument.String("package").pipe(
			Argument.withDescription(
				"npm package name to claim (its checkout directory must already exist)",
			),
		),
		name: nameFlag,
		ref: refFlag,
	},
	Effect.fn("vendor-src adopt")(function* ({ target, name, ref }) {
		const project = yield* Project;
		const git = yield* Git;
		yield* git.ensureReady;

		const source = yield* resolveInstalledSource(target);
		const vendorName = Option.getOrElse(name, () =>
			defaultVendorName(source.packageName),
		);
		const manifest = yield* project.readManifest;
		yield* ensureNotVendored(manifest, vendorName);
		const prefix = repoPrefix(manifest, vendorName);
		if (!(yield* checkoutExists(manifest, vendorName))) {
			return yield* new CommandError({
				message: `${prefix} does not exist. Use vendor-src add ${source.packageName} to create it, or place a checkout at ${prefix} first.`,
			});
		}

		const gitRef = Option.isSome(ref)
			? ref.value
			: yield* git.resolveTag(source.url, source.packageName, source.version);

		const updated = setRepo(manifest, vendorName, {
			package: source.packageName,
			url: source.url,
			version: source.version,
			ref: gitRef,
		});
		yield* writeProjectFiles(updated);

		yield* Console.log(
			`Adopted existing ${prefix} as ${source.packageName}@${source.version} (${gitRef}). Commit vendor-src.json, AGENTS.md, ${vendorDir(updated)}/AGENTS.md, and editor ignores.`,
		);
	}, reportErrors),
).pipe(
	Command.withDescription(
		"Claim an existing checkout in vendor-src.json without git subtree add",
	),
);
