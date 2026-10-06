import { Effect, FileSystem, Path } from "effect";

import { upsertAgentsBlock, type AgentsRepoLine } from "./agentsMd.ts";
import { mergeIgnoreFile, mergeVsCodeSettings } from "./editorConfig.ts";
import {
	emptyManifest,
	MANIFEST_FILENAME,
	parseManifest,
	stringifyManifest,
	type VendorSrcManifest,
} from "./manifest.ts";

export const findProjectRoot = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	let current = path.resolve(".");
	for (;;) {
		const gitDir = path.join(current, ".git");
		const packageJson = path.join(current, "package.json");
		const hasGit = yield* fs.exists(gitDir);
		const hasPkg = yield* fs.exists(packageJson);
		if (hasGit && hasPkg) {
			return current;
		}
		const parent = path.dirname(current);
		if (parent === current) {
			return yield* Effect.fail(
				new Error("not inside a git repository with a package.json"),
			);
		}
		current = parent;
	}
});

export const readManifest = (projectRoot: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const file = path.join(projectRoot, MANIFEST_FILENAME);
		const exists = yield* fs.exists(file);
		if (!exists) {
			return emptyManifest();
		}
		const raw = yield* fs.readFileString(file);
		return parseManifest(raw);
	});

export const writeManifest = (
	projectRoot: string,
	manifest: VendorSrcManifest,
) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const file = path.join(projectRoot, MANIFEST_FILENAME);
		yield* fs.writeFileString(file, stringifyManifest(manifest));
	});

export const updateAgentsMd = (
	projectRoot: string,
	manifest: VendorSrcManifest,
) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const file = path.join(projectRoot, "AGENTS.md");
		const exists = yield* fs.exists(file);
		const existing = exists ? yield* fs.readFileString(file) : undefined;
		const repos: AgentsRepoLine[] = Object.entries(manifest.repos).map(
			([name, repo]) => ({
				name,
				package: repo.package,
				path: `${manifest.dir}/${name}`,
			}),
		);
		yield* fs.writeFileString(file, upsertAgentsBlock(existing, repos));
	});

export const updateEditorIgnores = (projectRoot: string, dir: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		const ignorePath = path.join(projectRoot, ".ignore");
		const ignoreExists = yield* fs.exists(ignorePath);
		const ignoreExisting = ignoreExists
			? yield* fs.readFileString(ignorePath)
			: undefined;
		yield* fs.writeFileString(ignorePath, mergeIgnoreFile(ignoreExisting, dir));

		const vscodeDir = path.join(projectRoot, ".vscode");
		yield* fs.makeDirectory(vscodeDir, { recursive: true });
		const settingsPath = path.join(vscodeDir, "settings.json");
		const settingsExists = yield* fs.exists(settingsPath);
		const settingsExisting = settingsExists
			? yield* fs.readFileString(settingsPath)
			: undefined;
		yield* fs.writeFileString(
			settingsPath,
			mergeVsCodeSettings(settingsExisting, dir),
		);
	});

export const ensurePostinstall = (projectRoot: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const file = path.join(projectRoot, "package.json");
		const raw = yield* fs.readFileString(file);
		const pkg = JSON.parse(raw) as {
			name?: string;
			scripts?: Record<string, string>;
			[key: string]: unknown;
		};
		const scripts = { ...pkg.scripts };
		const current = scripts.postinstall;
		const selfCheck = "node ./scripts/postinstall-check.mjs";
		const dependencyCheck = "vendor-src check";
		const desired = pkg.name === "vendor-src" ? selfCheck : dependencyCheck;
		if (
			current === desired ||
			current?.includes("vendor-src check") ||
			current?.includes("postinstall-check.mjs")
		) {
			return;
		}
		scripts.postinstall = current ? `${current} && ${desired}` : desired;
		pkg.scripts = scripts;
		yield* fs.writeFileString(file, `${JSON.stringify(pkg, null, "\t")}\n`);
	});
