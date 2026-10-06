import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import { emptyManifest, setRepo } from "./manifest.ts";
import { Project } from "./project.ts";
import {
	exists,
	git,
	isolateGitConfig,
	makeProject,
	readFile,
	tempDir,
	writeFiles,
} from "./testUtils.ts";

isolateGitConfig();

const manifest = setRepo(emptyManifest, "effect", {
	package: "effect",
	url: "https://github.com/Effect-TS/effect.git",
	version: "4.0.1",
	ref: "effect@4.0.1",
});

const withProject = <A, E, R>(
	root: string,
	effect: Effect.Effect<A, E, R | Project>,
) => Effect.provide(effect, Project.layerFrom(root));

describe("Project.make", () => {
	it.effect("finds the root from a nested directory", () =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const root = yield* makeProject(yield* tempDir);
			yield* writeFiles(root, { "packages/app/package.json": "{}" });

			const project = yield* Project.make(path.join(root, "packages", "app"));
			// packages/app has a package.json but no .git, so keep walking up.
			assert.strictEqual(project.root, root);
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("fails outside a project", () =>
		Effect.gen(function* () {
			const dir = yield* tempDir;
			const error = yield* Project.make(dir).pipe(Effect.flip);
			assert.strictEqual(error._tag, "ProjectNotFoundError");
			assert.include(error.message, "not inside a git repository");
		}).pipe(Effect.provide(NodeServices.layer)),
	);
});

describe("Project.readManifest / writeManifest", () => {
	it.effect("returns an empty manifest when the file is missing", () =>
		Effect.gen(function* () {
			const root = yield* makeProject(yield* tempDir);
			const read = yield* withProject(
				root,
				Project.use((project) => project.readManifest),
			);
			assert.deepStrictEqual(read, emptyManifest);
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("round-trips through vendor-src.json", () =>
		Effect.gen(function* () {
			const root = yield* makeProject(yield* tempDir);
			const read = yield* withProject(
				root,
				Effect.gen(function* () {
					const project = yield* Project;
					yield* project.writeManifest(manifest);
					return yield* project.readManifest;
				}),
			);
			assert.deepStrictEqual(read, manifest);
		}).pipe(Effect.provide(NodeServices.layer)),
	);
});

describe("Project.writeAgentsMd", () => {
	it.effect(
		"writes the managed block through an AGENTS.md → README.md symlink",
		() =>
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem;
				const path = yield* Path.Path;
				const root = yield* makeProject(yield* tempDir, {
					"README.md": "# Toy projects\n\nHello.\n",
				});
				yield* fs.symlink("README.md", path.join(root, "AGENTS.md"));

				yield* withProject(
					root,
					Project.use((project) => project.writeAgentsMd(manifest)),
				);

				assert.strictEqual(
					yield* fs.readLink(path.join(root, "AGENTS.md")),
					"README.md",
				);
				const readme = yield* readFile(root, "README.md");
				assert.include(readme, "# Toy projects");
				assert.include(readme, "<!-- vendor-src:start -->");
				assert.include(readme, "- `effect@4.0.1` → `repos/effect`");
				assert.include(readme, "### Vendored packages");
				assert.include(readme, "<!-- vendor-src:end -->");

				const vendorAgents = yield* readFile(root, "repos", "AGENTS.md");
				assert.include(vendorAgents, "## Don'ts");
				assert.include(vendorAgents, "`effect@4.0.1`");
			}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("creates AGENTS.md when missing", () =>
		Effect.gen(function* () {
			const root = yield* makeProject(yield* tempDir);
			yield* withProject(
				root,
				Project.use((project) => project.writeAgentsMd(emptyManifest)),
			);
			const agents = yield* readFile(root, "AGENTS.md");
			assert.include(agents, "<!-- vendor-src:start -->");
			assert.include(agents, "## Vendored Source");
		}).pipe(Effect.provide(NodeServices.layer)),
	);
});

describe("Project.writeEditorIgnores", () => {
	it.effect(
		"merges oxfmt + VS Code config and only touches existing legacy ignore files",
		() =>
			Effect.gen(function* () {
				const root = yield* makeProject(yield* tempDir, {
					".prettierignore": "coverage/\n",
				});
				yield* withProject(
					root,
					Project.use((project) => project.writeEditorIgnores(manifest)),
				);
				assert.strictEqual(
					yield* readFile(root, ".prettierignore"),
					"coverage/\nrepos/\n",
				);
				assert.isFalse(yield* exists(root, ".eslintignore"));
				assert.include(yield* readFile(root, ".oxfmtrc.json"), '"repos/"');
				assert.include(
					yield* readFile(root, ".vscode", "settings.json"),
					'"repos/**": true',
				);
			}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("reports invalid JSONC with the file name", () =>
		Effect.gen(function* () {
			const root = yield* makeProject(yield* tempDir, {
				".vscode/settings.json": "{ not json",
			});
			const error = yield* withProject(
				root,
				Project.use((project) => project.writeEditorIgnores(manifest)),
			).pipe(Effect.flip);
			assert.strictEqual(error._tag, "ConfigFileError");
			assert.include(error.message, ".vscode/settings.json is not valid");
		}).pipe(Effect.provide(NodeServices.layer)),
	);
});

describe("Project.ensurePostinstall", () => {
	it.effect("appends to an existing postinstall and preserves key order", () =>
		Effect.gen(function* () {
			const root = yield* makeProject(yield* tempDir, {
				"package.json": `{\n  "name": "app",\n  "scripts": {\n    "postinstall": "husky"\n  },\n  "private": true\n}\n`,
			});
			git(root, "add", "-A");
			yield* withProject(
				root,
				Project.use((project) => project.ensurePostinstall),
			);
			assert.strictEqual(
				yield* readFile(root, "package.json"),
				`{\n  "name": "app",\n  "scripts": {\n    "postinstall": "husky && vendor-src check"\n  },\n  "private": true\n}\n`,
			);
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("leaves the published vendor-src package alone", () =>
		Effect.gen(function* () {
			const raw = `{\n\t"name": "vendor-src"\n}\n`;
			const root = yield* makeProject(yield* tempDir, { "package.json": raw });
			yield* withProject(
				root,
				Project.use((project) => project.ensurePostinstall),
			);
			assert.strictEqual(yield* readFile(root, "package.json"), raw);
		}).pipe(Effect.provide(NodeServices.layer)),
	);
});
