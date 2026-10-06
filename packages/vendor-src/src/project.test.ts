import { assert, layer } from "@effect/vitest";
import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";

import { emptyManifest, setRepo } from "./manifest.ts";
import { Project, writeProjectFiles } from "./project.ts";
import { exists, json, readFile, tempDir, writeFiles } from "./testing.ts";

const manifest = setRepo(emptyManifest(), "effect", {
	package: "effect",
	url: "https://github.com/Effect-TS/effect.git",
	version: "4.0.1",
	ref: "effect@4.0.1",
});

const makeProject = Effect.fnUntraced(function* (
	files: Readonly<Record<string, string>> = {},
) {
	const root = yield* tempDir;
	yield* writeFiles(root, {
		".git/HEAD": "ref: refs/heads/main\n",
		"package.json": json({ name: "app" }),
		...files,
	});
	return root;
});

const withProject = <A, E, R>(
	root: string,
	effect: Effect.Effect<A, E, R | Project>,
) => Effect.provide(effect, Project.layerAt(root));

layer(NodeServices.layer)("Project", (it) => {
	it.effect("finds the git root from a nested directory", () =>
		Effect.gen(function* () {
			const root = yield* makeProject({ "packages/app/package.json": "{}" });
			const path = yield* Path.Path;
			const project = yield* withProject(
				path.join(root, "packages/app"),
				Effect.service(Project),
			);
			assert.strictEqual(project.root, root);
		}),
	);

	it.effect("falls back to the package with vendor-src.json without .git", () =>
		Effect.gen(function* () {
			const root = yield* tempDir;
			yield* writeFiles(root, {
				"package.json": json({ name: "app" }),
				"vendor-src.json": json(emptyManifest()),
			});
			const project = yield* withProject(root, Effect.service(Project));
			assert.strictEqual(project.root, root);
		}),
	);

	it.effect("fails with ProjectNotFoundError outside a project", () =>
		Effect.gen(function* () {
			const root = yield* tempDir;
			const error = yield* Effect.flip(Project.make(root));
			assert.strictEqual(error._tag, "ProjectNotFoundError");
		}),
	);

	it.effect("reads an empty manifest when vendor-src.json is missing", () =>
		Effect.gen(function* () {
			const root = yield* makeProject();
			const project = yield* withProject(root, Effect.service(Project));
			assert.deepStrictEqual(yield* project.readManifest, emptyManifest());
		}),
	);

	it.effect(
		"writes the managed block through an AGENTS.md → README.md symlink",
		() =>
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem;
				const path = yield* Path.Path;
				const root = yield* makeProject({
					"README.md": "# Toy projects\n\nHello.\n",
				});
				yield* fs.symlink("README.md", path.join(root, "AGENTS.md"));

				yield* withProject(
					root,
					Effect.flatMap(Effect.service(Project), (project) =>
						project.writeAgentsMd(manifest),
					),
				);

				assert.strictEqual(
					yield* fs.readLink(path.join(root, "AGENTS.md")),
					"README.md",
				);
				const readme = yield* readFile(root, "README.md");
				assert.include(readme, "# Toy projects");
				assert.include(readme, "<!-- vendor-src:start -->");
				assert.include(readme, "- `effect@4.0.1` → `repos/effect`");
				assert.include(readme, "<!-- vendor-src:end -->");

				const vendorAgents = yield* readFile(root, "repos/AGENTS.md");
				assert.include(vendorAgents, "## Don'ts");
				assert.include(vendorAgents, "- `effect/` — `effect@4.0.1`");
			}),
	);

	it.effect("writes manifest, AGENTS, tooling ignores, and postinstall", () =>
		Effect.gen(function* () {
			const root = yield* makeProject({
				"package.json": json({
					name: "app",
					scripts: { postinstall: "husky" },
				}),
				".prettierignore": "dist/\n",
			});

			yield* withProject(root, writeProjectFiles(manifest));

			assert.deepStrictEqual(
				JSON.parse(yield* readFile(root, "vendor-src.json")),
				JSON.parse(json(manifest)),
			);
			assert.include(yield* readFile(root, "AGENTS.md"), "## Vendored Source");
			assert.isTrue(yield* exists(root, "repos/AGENTS.md"));
			assert.strictEqual(
				yield* readFile(root, ".prettierignore"),
				"dist/\nrepos/\n",
			);
			assert.isFalse(yield* exists(root, ".eslintignore"));
			assert.deepStrictEqual(
				JSON.parse(yield* readFile(root, ".oxfmtrc.json")),
				{ ignorePatterns: ["repos/"] },
			);
			assert.include(
				yield* readFile(root, ".vscode/settings.json"),
				'"repos/**": true',
			);
			assert.deepStrictEqual(
				JSON.parse(yield* readFile(root, "package.json")).scripts,
				{ postinstall: "husky && vendor-src check" },
			);
		}),
	);

	it.effect("leaves an existing vendor-src postinstall alone", () =>
		Effect.gen(function* () {
			const packageJson = json({
				name: "app",
				scripts: { postinstall: "vendor-src check" },
			});
			const root = yield* makeProject({ "package.json": packageJson });
			yield* withProject(
				root,
				Effect.flatMap(
					Effect.service(Project),
					(project) => project.ensurePostinstall,
				),
			);
			assert.strictEqual(yield* readFile(root, "package.json"), packageJson);
		}),
	);

	it.effect("reports an unparsable package.json as ConfigFileError", () =>
		Effect.gen(function* () {
			const root = yield* makeProject({ "package.json": "{ nope" });
			const error = yield* withProject(
				root,
				Effect.flatMap(
					Effect.service(Project),
					(project) => project.ensurePostinstall,
				),
			).pipe(Effect.flip);
			assert.strictEqual(error._tag, "ConfigFileError");
		}),
	);
});
