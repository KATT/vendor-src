export {
	AGENTS_END,
	AGENTS_START,
	removeAgentsBlock,
	renderAgentsBlock,
	renderVendorDirAgentsMd,
	upsertAgentsBlock,
} from "./agentsMd.ts";
export { layer, run, vendorSrc } from "./cli.ts";
export {
	Git,
	GitError,
	TagNotFoundError,
	toFetchRef,
	WorkingTreeError,
} from "./git.ts";
export {
	compileIgnorePatterns,
	matchesIgnore,
	selectIgnoredPaths,
} from "./ignore.ts";
export {
	decodeManifest,
	DEFAULT_DIR,
	emptyManifest,
	encodeManifest,
	findDrift,
	findRepoByUrl,
	findVendoredPackage,
	pinnedPackage,
	Manifest,
	ManifestError,
	ManifestJson,
	ManifestNotFoundError,
	MANIFEST_FILENAME,
	MANIFEST_SCHEMA_URL,
	removeRepo,
	repoPrefix,
	setRepo,
	vendorDir,
	VendoredRepo,
	type Drift,
	type VendoredPackage,
} from "./manifest.ts";
export {
	InstalledPackageJson,
	InstalledPackages,
	parsePnpmWorkspacePackages,
	suggestPackages,
	type DeclaredDependency,
} from "./packages.ts";
export {
	ConfigFileError,
	Project,
	ProjectNotFoundError,
	type ChangedFiles,
} from "./project.ts";
export {
	defaultCheckoutName,
	defaultVendorName,
	normalizeRepositoryUrl,
	repositoryDirectory,
	repositoryName,
	repositorySlug,
} from "./repository.ts";
export { compareSemver, maxSemver, parseSemver } from "./semver.ts";
export {
	candidateTags,
	parseLsRemoteTags,
	pickTag,
	unscopedName,
} from "./tags.ts";
