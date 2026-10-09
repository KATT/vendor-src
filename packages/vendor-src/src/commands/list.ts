import { Console, Effect, Option } from "effect";
import { Command } from "effect/cli";

import { InstalledPackages } from "../packages.ts";
import { Project } from "../project.ts";
import { reportErrors } from "./shared.ts";

export const listCommand = Command.make(
	"list",
	{},
	Effect.fn("vendor-src list")(function* () {
		const project = yield* Project;
		const packages = yield* InstalledPackages;
		const manifest = yield* project.readManifest;
		const entries = Object.entries(manifest.repos);
		if (entries.length === 0) {
			yield* Console.log("No vendored repositories.");
			return;
		}

		for (const [name, repo] of entries) {
			const [pin, ...shared] = repo.packages;
			if (pin === undefined) {
				yield* Console.log(`${name}\t(git-only)\t${repo.ref}\tok`);
				continue;
			}
			const status = Option.match(yield* packages.version(pin), {
				onNone: () => "not installed",
				onSome: (installed) =>
					installed === repo.version ? "ok" : `drift (installed ${installed})`,
			});
			yield* Console.log(
				`${name}\t${pin}@${repo.version}\t${repo.ref}\t${status}`,
			);

			for (const packageName of shared) {
				const installed = Option.match(yield* packages.version(packageName), {
					onNone: () => "not installed",
					onSome: (version) => `installed ${version}`,
				});
				yield* Console.log(`  + ${packageName}\t${installed}`);
			}
		}
	}, reportErrors),
).pipe(
	Command.withDescription("List vendored repositories and drift status"),
	Command.withAlias("ls"),
);
