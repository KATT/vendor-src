export function mergeIgnoreFile(
	existing: string | undefined,
	dir: string,
): string {
	const pattern = `${dir.replace(/\/$/, "")}/`;
	const lines = existing ? existing.split("\n") : [];
	if (lines.some((line) => line.trim() === pattern || line.trim() === dir)) {
		return existing?.endsWith("\n") ? existing : `${existing ?? pattern}\n`;
	}
	const body = lines.join("\n").replace(/\s*$/, "");
	return body.length > 0 ? `${body}\n${pattern}\n` : `${pattern}\n`;
}

export function mergeVsCodeSettings(
	existingJson: string | undefined,
	dir: string,
): string {
	const pattern = `${dir.replace(/\/$/, "")}/**`;
	let settings: Record<string, unknown> = {};
	if (existingJson?.trim()) {
		try {
			settings = JSON.parse(existingJson) as Record<string, unknown>;
		} catch {
			settings = {};
		}
	}

	const autoImportKey = "typescript.preferences.autoImportFileExcludePatterns";
	const jsAutoImportKey =
		"javascript.preferences.autoImportFileExcludePatterns";
	settings[autoImportKey] = mergeStringArray(settings[autoImportKey], pattern);
	settings[jsAutoImportKey] = mergeStringArray(
		settings[jsAutoImportKey],
		pattern,
	);

	settings["files.exclude"] = mergeRecord(
		settings["files.exclude"] as Record<string, unknown> | undefined,
		pattern,
		true,
	);
	settings["files.watcherExclude"] = mergeRecord(
		settings["files.watcherExclude"] as Record<string, unknown> | undefined,
		pattern,
		true,
	);
	settings["search.exclude"] = mergeRecord(
		settings["search.exclude"] as Record<string, unknown> | undefined,
		pattern,
		true,
	);

	return `${JSON.stringify(settings, null, "\t")}\n`;
}

/**
 * Merge `repos/` (or custom dir) into ignore files used by common formatters
 * and linters. Oxfmt/Vite+ fmt read `.prettierignore` by default.
 */
export function mergeToolingIgnoreFiles(
	existing: Partial<Record<ToolingIgnoreFile, string | undefined>>,
	dir: string,
): Record<ToolingIgnoreFile, string> {
	const pattern = `${dir.replace(/\/$/, "")}/`;
	const result = {} as Record<ToolingIgnoreFile, string>;
	for (const file of TOOLING_IGNORE_FILES) {
		result[file] = mergeIgnoreFile(existing[file], pattern);
	}
	return result;
}

export const TOOLING_IGNORE_FILES = [
	".prettierignore",
	".eslintignore",
	".ignore",
] as const;

export type ToolingIgnoreFile = (typeof TOOLING_IGNORE_FILES)[number];

function mergeStringArray(value: unknown, item: string): string[] {
	const current = Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
	if (!current.includes(item)) {
		current.push(item);
	}
	return current;
}

function mergeRecord(
	value: Record<string, unknown> | undefined,
	key: string,
	flag: boolean,
): Record<string, unknown> {
	return { ...value, [key]: flag };
}
