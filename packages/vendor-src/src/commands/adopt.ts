import { Console, Effect, FileSystem, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import { Git } from "../git.ts";
import { repoPrefix, setRepo, vendorDir } from "../manifest.ts";
import { Project, writeProjectFiles } from "../project.ts";
import { defaultVendorName } from "../repository.ts";
import {
	CommandError,
	ensureNotVendored,
	nameFlag,
	resolveInstalledSource,
	toUserError,
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
				"npm package name to claim (its directory must already exist)",
			),
		),
		name: nameFlag,
		ref: Flag.String("ref").pipe(
			Flag.withDescription("Git ref/tag to record (skips version/tag lookup)"),
			Flag.optional,
		),
	},
	Effect.fn("adopt")(function* ({ target, name, ref }) {
		const fs = yield* FileSystem.FileSystem;
		const project = yield* Project;
		const git = yield* Git;
		yield* git.ensureCleanWorkingTree;

		const source = yield* resolveInstalledSource(target, ref);
		const vendorName = Option.getOrElse(name, () =>
			defaultVendorName(source.packageName),
		);
		const manifest = yield* project.readManifest;
		yield* ensureNotVendored(manifest, vendorName);

		const prefix = repoPrefix(manifest, vendorName);
		if (!(yield* fs.exists(project.resolve(prefix)))) {
			return yield* new CommandError({
				message: `${prefix} does not exist. Use vendor-src add ${source.packageName} to create it, or place a checkout at ${prefix} first.`,
			});
		}

		const next = setRepo(manifest, vendorName, {
			package: source.packageName,
			url: source.url,
			version: source.version,
			ref: source.ref,
		});
		yield* writeProjectFiles(next);

		yield* Console.log(
			`Adopted existing ${prefix} as ${source.packageName}@${source.version} (${source.ref}). Commit vendor-src.json, AGENTS.md, ${vendorDir(next)}/AGENTS.md, and editor ignores.`,
		);
	}, Effect.mapError(toUserError)),
).pipe(
	Command.withDescription(
		"Claim an existing checkout in the vendor dir without git subtree add",
	),
);
