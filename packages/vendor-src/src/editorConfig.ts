import { Effect, Predicate } from "effect";

import { decodeJsonObject, stringifyJson } from "./json.ts";

const trimSlash = (dir: string) => dir.replace(/\/+$/, "");

const withTrailingNewline = (text: string) =>
	text.endsWith("\n") ? text : `${text}\n`;

export function mergeIgnoreFile(
	existing: string | undefined,
	dir: string,
): string {
	const pattern = `${trimSlash(dir)}/`;
	const lines = existing ? existing.split("\n") : [];
	if (
		existing &&
		lines.some((line) => line.trim() === pattern || line.trim() === dir)
	) {
		return withTrailingNewline(existing);
	}
	const body = lines.join("\n").replace(/\s*$/, "");
	return body.length > 0 ? `${body}\n${pattern}\n` : `${pattern}\n`;
}

/**
 * Only updated when the file already exists, so oxfmt-only projects do not get
 * Prettier/ESLint ignore files created for them.
 */
export const OPTIONAL_IGNORE_FILES = [
	".prettierignore",
	".eslintignore",
] as const;

export type OptionalIgnoreFile = (typeof OPTIONAL_IGNORE_FILES)[number];

export const OXFMT_CONFIG_FILE = ".oxfmtrc.json";

export const VSCODE_SETTINGS_FILE = ".vscode/settings.json";

/**
 * Merge `repos/` into Prettier/ESLint ignore files only when those files
 * already exist. Oxfmt uses `.oxfmtrc.json` `ignorePatterns` instead.
 */
export function mergeToolingIgnoreFiles(
	existing: Partial<Record<OptionalIgnoreFile, string>>,
	dir: string,
): Partial<Record<OptionalIgnoreFile, string>> {
	const result: Partial<Record<OptionalIgnoreFile, string>> = {};
	for (const file of OPTIONAL_IGNORE_FILES) {
		if (existing[file] !== undefined) {
			result[file] = mergeIgnoreFile(existing[file], dir);
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
export const mergeOxfmtConfig = Effect.fnUntraced(function* (
	existing: string | undefined,
	dir: string,
) {
	const pattern = `${trimSlash(dir)}/`;
	if (!existing?.trim()) {
		return stringifyJson({ ignorePatterns: [pattern] });
	}
	const config = yield* decodeJsonObject(OXFMT_CONFIG_FILE, existing);
	const current = stringEntries(config.ignorePatterns);
	if (coversDir(current, pattern)) {
		return withTrailingNewline(existing);
	}
	return stringifyJson(
		{ ...config, ignorePatterns: [...current, pattern] },
		existing,
	);
});

/** Exclude the vendor dir from VS Code search, file watching, and auto-imports. */
export const mergeVsCodeSettings = Effect.fnUntraced(function* (
	existing: string | undefined,
	dir: string,
) {
	const pattern = `${trimSlash(dir)}/**`;
	const settings = existing?.trim()
		? yield* decodeJsonObject(VSCODE_SETTINGS_FILE, existing)
		: {};
	const merged = applyVsCodeExcludes(settings, pattern);
	if (existing?.trim() && JSON.stringify(merged) === JSON.stringify(settings)) {
		return withTrailingNewline(existing);
	}
	return stringifyJson(merged, existing);
});

const AUTO_IMPORT_EXCLUDE_KEYS = [
	"typescript.preferences.autoImportFileExcludePatterns",
	"javascript.preferences.autoImportFileExcludePatterns",
] as const;

const EXCLUDE_RECORD_KEYS = [
	"files.exclude",
	"files.watcherExclude",
	"search.exclude",
] as const;

function applyVsCodeExcludes(
	settings: Readonly<Record<string, unknown>>,
	pattern: string,
): Record<string, unknown> {
	const merged: Record<string, unknown> = { ...settings };
	for (const key of AUTO_IMPORT_EXCLUDE_KEYS) {
		const current = stringEntries(settings[key]);
		merged[key] = coversDir(current, pattern) ? current : [...current, pattern];
	}
	for (const key of EXCLUDE_RECORD_KEYS) {
		const current = settings[key];
		merged[key] = {
			...(Predicate.isObject(current) ? current : {}),
			[pattern]: true,
		};
	}
	return merged;
}

function stringEntries(value: unknown): string[] {
	return Array.isArray(value) ? value.filter(Predicate.isString) : [];
}

/** True when one of `entries` already excludes the directory behind `pattern`. */
function coversDir(entries: readonly string[], pattern: string): boolean {
	const dir = pattern.replace(/\/\*\*$/, "").replace(/\/$/, "");
	return entries.some((entry) => [dir, `${dir}/`, `${dir}/**`].includes(entry));
}
