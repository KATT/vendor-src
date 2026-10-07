import { Console, Effect, Option } from "effect";
import { Command } from "effect/cli";

import { repoPrefix } from "../manifest.ts";
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
			const status = Option.match(yield* packages.version(repo.package), {
				onNone: () => "not installed",
				onSome: (installed) =>
					installed === repo.version ? "ok" : `drift (installed ${installed})`,
			});
			yield* Console.log(
				`${name}\t${repo.package}@${repo.version}\t${repo.ref}\t${status}`,
			);

			for (const sibling of repo.siblings ?? []) {
				const prefix = repoPrefix(manifest, name);
				const inCheckout = yield* project.checkoutPackageVersion(
					sibling.directory === undefined
						? prefix
						: `${prefix}/${sibling.directory}`,
				);
				const installed = yield* packages.version(sibling.package);
				const checkout = Option.getOrElse(inCheckout, () => "?");
				const siblingStatus = Option.match(installed, {
					onNone: () => "not installed",
					onSome: (version) =>
						Option.contains(inCheckout, version)
							? "ok"
							: `checkout differs (installed ${version})`,
				});
				yield* Console.log(
					`  + ${sibling.package}@${checkout}\tvia ${repo.package}\t${siblingStatus}`,
				);
			}
		}
	}, reportErrors),
).pipe(
	Command.withDescription("List vendored repositories and drift status"),
	Command.withAlias("ls"),
);
