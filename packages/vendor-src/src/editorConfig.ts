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
 * Always-written ignore files for tooling that is not Prettier/ESLint-named.
 */
export const ALWAYS_IGNORE_FILES = [".ignore"] as const;

/**
 * Only updated when the file already exists, so oxfmt-only projects do not get
 * Prettier/ESLint ignore files created for them.
 */
export const OPTIONAL_IGNORE_FILES = [
	".prettierignore",
	".eslintignore",
] as const;

export const OXFMT_CONFIG_FILE = ".oxfmtrc.json";

export type AlwaysIgnoreFile = (typeof ALWAYS_IGNORE_FILES)[number];
export type OptionalIgnoreFile = (typeof OPTIONAL_IGNORE_FILES)[number];
export type ToolingIgnoreFile = AlwaysIgnoreFile | OptionalIgnoreFile;

/**
 * Merge `repos/` into `.ignore` always, and into Prettier/ESLint ignore files
 * only when those files already exist.
 */
export function mergeToolingIgnoreFiles(
	existing: Partial<Record<ToolingIgnoreFile, string | undefined>>,
	dir: string,
): Partial<Record<ToolingIgnoreFile, string>> {
	const pattern = `${dir.replace(/\/$/, "")}/`;
	const result: Partial<Record<ToolingIgnoreFile, string>> = {
		".ignore": mergeIgnoreFile(existing[".ignore"], pattern),
	};
	for (const file of OPTIONAL_IGNORE_FILES) {
		if (existing[file] !== undefined) {
			result[file] = mergeIgnoreFile(existing[file], pattern);
		}
	}
	return result;
}

/**
 * Ensure Oxfmt's native config excludes the vendor dir via `ignorePatterns`.
 */
export function mergeOxfmtConfig(
	existingJson: string | undefined,
	dir: string,
): string {
	const pattern = `${dir.replace(/\/$/, "")}/`;
	let config: Record<string, unknown> = {};
	if (existingJson?.trim()) {
		try {
			config = JSON.parse(existingJson) as Record<string, unknown>;
		} catch {
			config = {};
		}
	}
	config.ignorePatterns = mergeStringArray(config.ignorePatterns, pattern);
	return `${JSON.stringify(config, null, "\t")}\n`;
}

function mergeStringArray(value: unknown, item: string): string[] {
	const current = Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
	if (
		!current.includes(item) &&
		!current.includes(item.replace(/\/$/, "")) &&
		!current.includes(`${item}**`) &&
		!current.includes(`${item}/**`)
	) {
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
