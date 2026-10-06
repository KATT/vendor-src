export {
	AGENTS_END,
	AGENTS_START,
	renderAgentsBlock,
	renderVendorDirAgentsMd,
	upsertAgentsBlock,
} from "./agentsMd.ts";
export { mergeIgnoreFile, mergeVsCodeSettings } from "./editorConfig.ts";
export {
	DEFAULT_IGNORE,
	findIgnoredPaths,
	matchesIgnore,
	resolveIgnorePatterns,
} from "./ignore.ts";
export {
	findDrift,
	MANIFEST_FILENAME,
	MANIFEST_SCHEMA_URL,
	parseManifest,
	stringifyManifest,
	type VendorSrcManifest,
	type VendoredRepo,
} from "./manifest.ts";
export { defaultVendorName, normalizeRepositoryUrl } from "./repository.ts";
export { compareSemver, maxSemver, parseSemver } from "./semver.ts";
export {
	candidateTags,
	parseLsRemoteTags,
	pickTag,
	unscopedName,
} from "./tags.ts";
