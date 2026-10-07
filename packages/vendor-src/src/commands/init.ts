import { Console, Effect, Option, Path } from "effect";
import { Command, Flag } from "effect/cli";

import {
	DEFAULT_DIR,
	emptyManifest,
	MANIFEST_FILENAME,
	vendorDir,
	type Manifest,
} from "../manifest.ts";
import { Project } from "../project.ts";
import { CommandError, reportErrors } from "./shared.ts";

/** Normalize a user-supplied vendor dir, rejecting paths outside the project. */
const normalizeDir = Effect.fnUntraced(function* (dir: string) {
	const path = yield* Path.Path;
	const normalized = path.normalize(dir.trim()).replace(/\/+$/, "");
	if (
		path.isAbsolute(normalized) ||
		normalized === "." ||
		normalized === "" ||
		normalized === ".." ||
		normalized.startsWith("../")
	) {
		return yield* new CommandError({
			message: `--dir must be a relative path inside the project, got ${JSON.stringify(dir)}`,
		});
	}
	return normalized;
});

const describe = (manifest: Manifest) =>
	`dir: ${JSON.stringify(vendorDir(manifest))}, rootAgentsMd: ${manifest.rootAgentsMd}`;

export const initCommand = Command.make(
	"init",
	{
		dir: Flag.String("dir").pipe(
			Flag.withDescription(
				`Directory for vendored checkouts (default: ${DEFAULT_DIR})`,
			),
			Flag.optional,
		),
		rootAgentsMd: Flag.Boolean("root-agents-md").pipe(
			Flag.withDescription(
				"Maintain a managed section in the root AGENTS.md (default: on; pass --no-root-agents-md to opt out)",
			),
			Flag.optional,
		),
	},
	Effect.fn("vendor-src init")(function* ({ dir, rootAgentsMd }) {
		const project = yield* Project;
		const requestedDir = Option.isSome(dir)
			? Option.some(yield* normalizeDir(dir.value))
			: Option.none<string>();

		const existing = yield* project.findManifest;
		const changed: string[] = [];
		let manifest: Manifest;

		if (Option.isSome(existing)) {
			manifest = existing.value;
			const currentDir = vendorDir(manifest);
			if (Option.isSome(requestedDir) && requestedDir.value !== currentDir) {
				const move =
					Object.keys(manifest.repos).length > 0
						? `move the checkouts (git mv ${currentDir} ${requestedDir.value}), `
						: "";
				return yield* new CommandError({
					message:
						`${MANIFEST_FILENAME} already sets dir to ${JSON.stringify(currentDir)}. ` +
						`To change it, ${move}set "dir" in ${MANIFEST_FILENAME}, then re-run vendor-src init.`,
				});
			}
			if (
				Option.isSome(rootAgentsMd) &&
				rootAgentsMd.value !== manifest.rootAgentsMd
			) {
				return yield* new CommandError({
					message:
						`${MANIFEST_FILENAME} already sets rootAgentsMd to ${manifest.rootAgentsMd}. ` +
						`To change it, set "rootAgentsMd" in ${MANIFEST_FILENAME}, then re-run vendor-src init.`,
				});
			}
			yield* Console.log(
				`${MANIFEST_FILENAME} already exists (${describe(manifest)}); re-applying setup.`,
			);
		} else {
			manifest = {
				...emptyManifest,
				dir: Option.getOrElse(requestedDir, () => DEFAULT_DIR),
				rootAgentsMd: Option.getOrElse(rootAgentsMd, () => true),
			};
			changed.push(...(yield* project.writeManifest(manifest)));
			yield* Console.log(
				`Created ${MANIFEST_FILENAME} (${describe(manifest)}).`,
			);
		}

		changed.push(...(yield* project.writeAgentsMd(manifest)));
		changed.push(...(yield* project.writeEditorIgnores(manifest)));
		const postinstall = yield* project.ensurePostinstall;
		if (postinstall._tag === "Ready") {
			changed.push(...postinstall.changed);
		} else {
			yield* Console.error(
				[
					"vendor-src: package.json already has a postinstall script; left it unchanged:",
					`  "postinstall": ${JSON.stringify(postinstall.existing)}`,
					"To also check vendored sources after every install, run both from it, e.g.:",
					`  "postinstall": ${JSON.stringify(postinstall.suggested)}`,
				].join("\n"),
			);
		}

		if (changed.length === 0) {
			yield* Console.log("Already set up; nothing changed.");
		} else {
			yield* Console.log(
				["Wrote:", ...changed.map((file) => `  ${file}`)].join("\n"),
			);
		}

		const hasRepos = Object.keys(manifest.repos).length > 0;
		if (changed.length > 0) {
			yield* Console.log(
				hasRepos
					? "Next: review and commit these files."
					: "Next: commit these files, then run `vendor-src add <package>`.",
			);
		} else if (!hasRepos) {
			yield* Console.log("Next: run `vendor-src add <package>`.");
		}
	}, reportErrors),
).pipe(
	Command.withDescription(
		"Set up vendor-src: create vendor-src.json, AGENTS.md files, tooling ignores, and the postinstall hook (safe to re-run)",
	),
	Command.withExamples([
		{
			command: "vendor-src init",
			description: `Use the defaults (vendor dir ${DEFAULT_DIR}, root AGENTS.md section on)`,
		},
		{
			command: "vendor-src init --dir vendor --no-root-agents-md",
			description: "Pick another folder and leave the root AGENTS.md alone",
		},
	]),
);
