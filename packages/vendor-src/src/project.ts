import { lstatSync, readlinkSync } from "node:fs";

import { Console, Effect, FileSystem, Path } from "effect";

import { upsertAgentsBlock, type AgentsRepoLine } from "./agentsMd.ts";
import {
	ALWAYS_IGNORE_FILES,
	detectIndent,
	mergeOxfmtConfig,
	mergeToolingIgnoreFiles,
	mergeVsCodeSettings,
	OPTIONAL_IGNORE_FILES,
	OXFMT_CONFIG_FILE,
	type ToolingIgnoreFile,
} from "./editorConfig.ts";
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
		if (exists) {
			try {
				if (lstatSync(file).isSymbolicLink()) {
					yield* Console.log(
						`Note: AGENTS.md is a symlink to ${readlinkSync(file)}; writing the vendor-src block through that link.`,
					);
				}
			} catch {
				// ignore race where the file disappears
			}
		}
		yield* fs.writeFileString(
			file,
			upsertAgentsBlock(existing, repos, manifest.dir),
		);
	});

export const updateEditorIgnores = (projectRoot: string, dir: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		const existing: Partial<Record<ToolingIgnoreFile, string>> = {};
		for (const file of [...ALWAYS_IGNORE_FILES, ...OPTIONAL_IGNORE_FILES]) {
			const fullPath = path.join(projectRoot, file);
			if (yield* fs.exists(fullPath)) {
				existing[file] = yield* fs.readFileString(fullPath);
			}
		}
		const merged = mergeToolingIgnoreFiles(existing, dir);
		for (const [file, contents] of Object.entries(merged)) {
			if (contents !== undefined) {
				yield* fs.writeFileString(path.join(projectRoot, file), contents);
			}
		}

		const oxfmtPath = path.join(projectRoot, OXFMT_CONFIG_FILE);
		const oxfmtExists = yield* fs.exists(oxfmtPath);
		const oxfmtExisting = oxfmtExists
			? yield* fs.readFileString(oxfmtPath)
			: undefined;
		yield* fs.writeFileString(oxfmtPath, mergeOxfmtConfig(oxfmtExisting, dir));

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
		// Never write postinstall into the published package itself.
		if (pkg.name === "vendor-src") {
			return;
		}
		const scripts = { ...pkg.scripts };
		const current = scripts.postinstall;
		const desired = "vendor-src check";
		if (current === desired || current?.includes("vendor-src check")) {
			return;
		}
		scripts.postinstall = current ? `${current} && ${desired}` : desired;
		pkg.scripts = scripts;
		const indent = detectIndent(raw);
		yield* fs.writeFileString(file, `${JSON.stringify(pkg, null, indent)}\n`);
	});
