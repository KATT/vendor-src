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
	if (existingJson?.trim()) {
		const settings = parseJsonObject(
			existingJson,
			".vscode/settings.json",
		) as Record<string, unknown>;
		const before = JSON.stringify(settings);
		applyVsCodeExcludes(settings, pattern);
		if (JSON.stringify(settings) === before) {
			return existingJson.endsWith("\n") ? existingJson : `${existingJson}\n`;
		}
		return `${JSON.stringify(settings, null, detectIndent(existingJson))}\n`;
	}

	const settings: Record<string, unknown> = {};
	applyVsCodeExcludes(settings, pattern);
	return `${JSON.stringify(settings, null, "\t")}\n`;
}

function applyVsCodeExcludes(
	settings: Record<string, unknown>,
	pattern: string,
): void {
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
 *
 * If the vendor dir is already covered (e.g. `repos/**`), the existing file is
 * returned unchanged so JSONC comments and formatting are preserved.
 */
export function mergeOxfmtConfig(
	existingJson: string | undefined,
	dir: string,
): string {
	const pattern = `${dir.replace(/\/$/, "")}/`;
	if (!existingJson?.trim()) {
		return `${JSON.stringify({ ignorePatterns: [pattern] }, null, "\t")}\n`;
	}

	const config = parseJsonObject(existingJson, OXFMT_CONFIG_FILE) as Record<
		string,
		unknown
	>;
	const before = Array.isArray(config.ignorePatterns)
		? [...(config.ignorePatterns as unknown[])]
		: undefined;
	const merged = mergeStringArray(config.ignorePatterns, pattern);
	if (
		before &&
		before.length === merged.length &&
		before.every((entry, index) => entry === merged[index])
	) {
		return existingJson.endsWith("\n") ? existingJson : `${existingJson}\n`;
	}

	config.ignorePatterns = merged;
	return `${JSON.stringify(config, null, detectIndent(existingJson))}\n`;
}

/** Parse JSON or JSONC (comments / trailing commas stripped). Fail loudly. */
export function parseJsonObject(text: string, label: string): unknown {
	try {
		return JSON.parse(stripJsonc(text));
	} catch (cause) {
		throw new Error(
			`${label} is not valid JSON/JSONC; fix it before running vendor-src (${String(cause)})`,
		);
	}
}

/** Strip `//` and block comments outside of strings; drop trailing commas. */
export function stripJsonc(text: string): string {
	let result = "";
	let i = 0;
	let inString = false;
	let escape = false;
	while (i < text.length) {
		const char = text[i]!;
		if (inString) {
			result += char;
			if (escape) {
				escape = false;
			} else if (char === "\\") {
				escape = true;
			} else if (char === '"') {
				inString = false;
			}
			i += 1;
			continue;
		}
		if (char === '"') {
			inString = true;
			result += char;
			i += 1;
			continue;
		}
		if (char === "/" && text[i + 1] === "/") {
			i += 2;
			while (i < text.length && text[i] !== "\n") {
				i += 1;
			}
			continue;
		}
		if (char === "/" && text[i + 1] === "*") {
			i += 2;
			while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
				i += 1;
			}
			i += 2;
			continue;
		}
		result += char;
		i += 1;
	}
	return result.replace(/,\s*([}\]])/g, "$1");
}

export function detectIndent(text: string): string {
	const match = text.match(/\n([ \t]+)"/);
	return match?.[1] ?? "\t";
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
