import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Option, Path } from "effect";

import { emptyManifest, setRepo } from "./manifest.ts";
import { Project } from "./project.ts";
import {
	exists,
	isolateGitConfig,
	makeProject,
	readFile,
	tempDir,
	writeFiles,
} from "./testUtils.ts";

isolateGitConfig();

const manifest = setRepo(emptyManifest, "effect", {
	packages: ["effect"],
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
	it.effect("asks for init when the file is missing", () =>
		Effect.gen(function* () {
			const root = yield* makeProject(yield* tempDir);
			const [found, error] = yield* withProject(
				root,
				Effect.gen(function* () {
					const project = yield* Project;
					return [
						yield* project.findManifest,
						yield* Effect.flip(project.readManifest),
					] as const;
				}),
			);
			assert.isTrue(Option.isNone(found));
			assert.strictEqual(error._tag, "ManifestNotFoundError");
			assert.include(error.message, "run `vendor-src init` first");
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
				assert.include(readme, "- `effect@4.0.1` → `.repos/effect`");
				assert.include(readme, "### Vendored packages");
				assert.include(readme, "<!-- vendor-src:end -->");

				const vendorAgents = yield* readFile(root, ".repos", "AGENTS.md");
				assert.include(vendorAgents, "## Don'ts");
				assert.include(vendorAgents, "`effect@4.0.1`");
			}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("reports changed files and skips writes that change nothing", () =>
		Effect.gen(function* () {
			const root = yield* makeProject(yield* tempDir);
			const [first, second] = yield* withProject(
				root,
				Effect.gen(function* () {
					const project = yield* Project;
					return [
						yield* project.writeAgentsMd(manifest),
						yield* project.writeAgentsMd(manifest),
					] as const;
				}),
			);
			assert.deepStrictEqual(first, ["AGENTS.md", ".repos/AGENTS.md"]);
			assert.deepStrictEqual(second, []);
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

	it.effect("leaves the root AGENTS.md alone when rootAgentsMd is false", () =>
		Effect.gen(function* () {
			const root = yield* makeProject(yield* tempDir);
			yield* withProject(
				root,
				Project.use((project) =>
					project.writeAgentsMd({ ...manifest, rootAgentsMd: false }),
				),
			);
			assert.isFalse(yield* exists(root, "AGENTS.md"));
			assert.include(
				yield* readFile(root, ".repos", "AGENTS.md"),
				"`effect@4.0.1`",
			);
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect(
		"removes an existing managed block when rootAgentsMd is false",
		() =>
			Effect.gen(function* () {
				const root = yield* makeProject(yield* tempDir, {
					"AGENTS.md": "# Project\n\nHello.\n",
				});
				yield* withProject(
					root,
					Project.use((project) => project.writeAgentsMd(manifest)),
				);
				assert.include(
					yield* readFile(root, "AGENTS.md"),
					"<!-- vendor-src:start -->",
				);

				yield* withProject(
					root,
					Project.use((project) =>
						project.writeAgentsMd({ ...manifest, rootAgentsMd: false }),
					),
				);
				assert.strictEqual(
					yield* readFile(root, "AGENTS.md"),
					"# Project\n\nHello.\n",
				);
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
					"coverage/\n.repos/\n",
				);
				assert.isFalse(yield* exists(root, ".eslintignore"));
				assert.include(yield* readFile(root, ".oxfmtrc.json"), '".repos/"');
				assert.include(
					yield* readFile(root, ".vscode", "settings.json"),
					'".repos/**": true',
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
	const packageJson = (scripts: string) =>
		`{\n  "name": "app",\n  "scripts": {\n${scripts}\n  },\n  "private": true\n}\n`;

	const ensureWith = Effect.fnUntraced(function* (raw: string) {
		const root = yield* makeProject(yield* tempDir, { "package.json": raw });
		const result = yield* withProject(
			root,
			Project.use((project) => project.ensurePostinstall),
		);
		return { result, written: yield* readFile(root, "package.json") };
	});

	it.effect("adds vendor-src check --sync and preserves key order", () =>
		Effect.gen(function* () {
			const { result, written } = yield* ensureWith(
				packageJson(`    "build": "tsc"`),
			);
			assert.deepStrictEqual(result, {
				_tag: "Ready",
				changed: ["package.json"],
			});
			assert.strictEqual(
				written,
				packageJson(
					`    "build": "tsc",\n    "postinstall": "vendor-src check --sync"`,
				),
			);
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("upgrades the bare hooks vendor-src used to write", () =>
		Effect.gen(function* () {
			for (const hook of ["vendor-src check", "vendor-src sync"]) {
				const { result, written } = yield* ensureWith(
					packageJson(`    "postinstall": "${hook}"`),
				);
				assert.strictEqual(result._tag, "Ready");
				assert.strictEqual(
					written,
					packageJson(`    "postinstall": "vendor-src check --sync"`),
				);
			}
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("leaves a postinstall that already runs check --sync alone", () =>
		Effect.gen(function* () {
			const raw = packageJson(
				`    "postinstall": "husky && vendor-src check --sync"`,
			);
			const { result, written } = yield* ensureWith(raw);
			assert.deepStrictEqual(result, { _tag: "Ready", changed: [] });
			assert.strictEqual(written, raw);
		}).pipe(Effect.provide(NodeServices.layer)),
	);

	it.effect("never rewrites another postinstall and suggests one", () =>
		Effect.gen(function* () {
			for (const [existing, suggested] of [
				["husky", "husky && vendor-src check --sync"],
				["husky && vendor-src check", "husky && vendor-src check --sync"],
				["vendor-src check --strict", "vendor-src check --sync --strict"],
				["husky && vendor-src sync", "husky && vendor-src check --sync"],
			] as const) {
				const raw = packageJson(`    "postinstall": "${existing}"`);
				const { result, written } = yield* ensureWith(raw);
				assert.deepStrictEqual(result, {
					_tag: "Occupied",
					existing,
					suggested,
				});
				assert.strictEqual(written, raw);
			}
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
