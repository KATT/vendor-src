export const AGENTS_START = "<!-- vendor-src:start -->";
export const AGENTS_END = "<!-- vendor-src:end -->";

export interface AgentsRepoLine {
	name: string;
	package: string;
	path: string;
}

export function renderAgentsBlock(
	repos: AgentsRepoLine[],
	dir = "repos",
): string {
	const root = dir.replace(/\/$/, "");
	const lines = [
		AGENTS_START,
		"## Vendored Repositories",
		"",
		`This project vendors external repositories under \`${root}/\`.`,
		"",
		"### How to use them",
		"",
		"- Use vendored repositories as **read-only reference material** when working with related libraries",
		"- Prefer examples and patterns from the vendored source code over generated guesses or web search results",
		`- Do not edit files under \`${root}/\` unless explicitly asked`,
		`- Do not import from \`${root}/\` — application code should continue importing from normal package dependencies`,
		"",
		"### Keep tooling out of vendored trees",
		"",
		`Formatters and linters must **never** rewrite \`${root}/\`. Running oxfmt/Prettier/ESLint/Vite+ fmt across the repo without excludes will churn thousands of upstream files.`,
		"",
		"- Do not run format/lint/fix commands that include this directory",
		`- Prefer project scripts that already exclude \`${root}/\` (see \`.prettierignore\`, \`.ignore\`, and editor settings)`,
		`- If you add a new formatter or linter, exclude \`${root}/**\` before the first run`,
		`- After vendoring updates, only commit intentional \`vendor-src\` metadata changes plus the subtree commit — never mass-format upstream sources`,
		"",
	];

	if (repos.length > 0) {
		lines.push("### Vendored sources");
		lines.push("");
		for (const repo of repos) {
			lines.push(
				`- \`${repo.path}\` — source for \`${repo.package}\`. Inspect for idiomatic usage, tests, module structure, and API design.`,
			);
		}
		lines.push("");
	}

	lines.push(AGENTS_END);
	return lines.join("\n");
}

/** Insert or replace the managed vendor-src block in AGENTS.md content. */
export function upsertAgentsBlock(
	existing: string | undefined,
	repos: AgentsRepoLine[],
	dir = "repos",
): string {
	const block = renderAgentsBlock(repos, dir);
	if (!existing || existing.trim().length === 0) {
		return `${block}\n`;
	}

	const start = existing.indexOf(AGENTS_START);
	const end = existing.indexOf(AGENTS_END);
	if (start !== -1 && end !== -1 && end > start) {
		const before = existing.slice(0, start).replace(/\s*$/, "\n\n");
		const after = existing.slice(end + AGENTS_END.length).replace(/^\s*/, "\n");
		return `${before}${block}${after}`.replace(/\n{3,}/g, "\n\n");
	}

	const trimmed = existing.replace(/\s*$/, "");
	return `${trimmed}\n\n${block}\n`;
}
