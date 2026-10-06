export {
	AGENTS_END,
	AGENTS_START,
	renderAgentsBlock,
	renderVendorDirAgentsMd,
	upsertAgentsBlock,
} from "./agentsMd.ts";
export { cli, vendorSrc } from "./cli.ts";
export {
	mergeIgnoreFile,
	mergeOxfmtConfig,
	mergeToolingIgnoreFiles,
	mergeVsCodeSettings,
} from "./editorConfig.ts";
export { Git, GitError, TagNotFoundError, WorkingTreeError } from "./git.ts";
export {
	compileIgnorePatterns,
	isLegacyRegexIgnorePattern,
	matchesIgnore,
	selectIgnoredPaths,
} from "./ignore.ts";
export { InstalledPackages, PackageJson } from "./installedPackages.ts";
export { ConfigFileError } from "./json.ts";
export {
	decodeManifest,
	DEFAULT_DIR,
	emptyManifest,
	encodeManifest,
	findDrift,
	Manifest,
	ManifestError,
	ManifestJson,
	MANIFEST_FILENAME,
	MANIFEST_SCHEMA_URL,
	removeRepo,
	repoPrefix,
	setRepo,
	vendorDir,
	VendoredRepo,
	type Drift,
} from "./manifest.ts";
export { Project, ProjectNotFoundError } from "./project.ts";
export { defaultVendorName, normalizeRepositoryUrl } from "./repository.ts";
export { compareSemver, maxSemver, parseSemver } from "./semver.ts";
export {
	candidateTags,
	parseLsRemoteTags,
	pickTag,
	unscopedName,
} from "./tags.ts";
