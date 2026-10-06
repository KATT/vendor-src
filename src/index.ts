export {
	AGENTS_END,
	AGENTS_START,
	renderAgentsBlock,
	upsertAgentsBlock,
} from "./agentsMd.ts";
export { mergeIgnoreFile, mergeVsCodeSettings } from "./editorConfig.ts";
export {
	findDrift,
	MANIFEST_FILENAME,
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
