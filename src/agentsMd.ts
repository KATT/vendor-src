export const AGENTS_START = "<!-- vendor-src:start -->";
export const AGENTS_END = "<!-- vendor-src:end -->";

export interface AgentsRepoLine {
	name: string;
	package: string;
	path: string;
}

export function renderAgentsBlock(repos: AgentsRepoLine[]): string {
	const lines = [
		AGENTS_START,
		"## Vendored Repositories",
		"",
		"This project vendors external repositories under `repos/`.",
		"",
		"- Use vendored repositories as read-only reference material when working with related libraries",
		"- Prefer examples and patterns from the vendored source code over generated guesses or web search results",
		"- Do not edit files under `repos/` unless explicitly asked",
		"- Do not import from `repos/` — application code should continue importing from normal package dependencies",
		"",
	];

	if (repos.length > 0) {
		lines.push("Vendored sources:");
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
): string {
	const block = renderAgentsBlock(repos);
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
