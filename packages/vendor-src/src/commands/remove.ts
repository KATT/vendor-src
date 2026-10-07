import { Console, Effect, FileSystem } from "effect";
import { Argument, Command } from "effect/cli";

import { Git } from "../git.ts";
import {
	findVendoredPackage,
	removeRepo,
	repoPrefix,
	setRepo,
} from "../manifest.ts";
import { Project } from "../project.ts";
import { CommandError, reportErrors } from "./shared.ts";

export const removeCommand = Command.make(
	"remove",
	{
		name: Argument.String("name").pipe(
			Argument.withDescription(
				"Checkout name under the vendor dir, or a vendored package name",
			),
		),
	},
	Effect.fn("vendor-src remove")(function* ({ name }) {
		const fs = yield* FileSystem.FileSystem;
		const project = yield* Project;
		const git = yield* Git;
		yield* git.ensureReady;

		const manifest = yield* project.readManifest;
		const byPackage = findVendoredPackage(manifest, name);
		const checkout =
			manifest.repos[name] !== undefined
				? name
				: byPackage?.role === "pin"
					? byPackage.name
					: undefined;

		if (checkout === undefined && byPackage?.role === "shared") {
			const prefix = repoPrefix(manifest, byPackage.name);
			const [pin, ...shared] = byPackage.repo.packages;
			const updated = setRepo(manifest, byPackage.name, {
				...byPackage.repo,
				packages: [pin, ...shared.filter((other) => other !== name)],
			});
			const changed = [
				...(yield* project.writeManifest(updated)),
				...(yield* project.writeAgentsMd(updated)),
			];
			yield* Console.log(
				`Stopped tracking ${name} in ${prefix}; the checkout stays (pinned by ${pin}). Commit: ${changed.join(", ")}`,
			);
			return;
		}

		if (checkout === undefined) {
			return yield* new CommandError({
				message: `no vendored repository or package named ${name}`,
			});
		}

		const repo = manifest.repos[checkout]!;
		const prefix = repoPrefix(manifest, checkout);
		const shared = repo.packages.slice(1);
		if (checkout !== name && shared.length > 0) {
			return yield* new CommandError({
				message:
					`${name} pins ${prefix}, which also holds ${shared.join(", ")}.\n` +
					`Remove the whole checkout with: vendor-src remove ${checkout}`,
			});
		}

		// Remove from disk rather than `git rm` so untracked files (e.g. .DS_Store) don't fail it.
		yield* fs.remove(project.resolve(prefix), { recursive: true, force: true });
		const updated = removeRepo(manifest, checkout);
		const changed = [
			...(yield* project.writeManifest(updated)),
			...(yield* project.writeAgentsMd(updated)),
		];
		const also = shared.length > 0 ? ` (also held ${shared.join(", ")})` : "";
		yield* Console.log(
			`Removed ${prefix}${also}. Commit: ${[prefix, ...changed].join(", ")}`,
		);
	}, reportErrors),
).pipe(
	Command.withDescription(
		"Remove a vendored checkout, or stop tracking a package that shares one",
	),
	Command.withAlias("rm"),
);
