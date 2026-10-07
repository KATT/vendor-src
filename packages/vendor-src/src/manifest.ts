import { Effect, Record, Schema } from "effect";

export const MANIFEST_FILENAME = "vendor-src.json";

/** Published schema URL for `$schema` in vendor-src.json (resolves via package export). */
export const MANIFEST_SCHEMA_URL = "https://unpkg.com/vendor-src/schema.json";

/** Vendor dir written into a freshly bootstrapped vendor-src.json. */
export const DEFAULT_DIR = ".repos";

/** Another npm package whose source lives in the same checkout. */
export const SiblingPackage = Schema.Struct({
	package: Schema.NonEmptyString,
	/** Path of the package inside the repo, from its `repository.directory`. */
	directory: Schema.optionalKey(Schema.NonEmptyString),
});
export type SiblingPackage = typeof SiblingPackage.Type;

export const VendoredRepo = Schema.Struct({
	/** npm package whose installed version pins the checkout's tag. */
	package: Schema.NonEmptyString,
	url: Schema.NonEmptyString,
	version: Schema.NonEmptyString,
	ref: Schema.NonEmptyString,
	/** Path of `package` inside the repo, from its `repository.directory`. */
	directory: Schema.optionalKey(Schema.NonEmptyString),
	/** Other installed packages published from the same repo. */
	siblings: Schema.optionalKey(Schema.Array(SiblingPackage)),
	/** Path globs to prune from this vendored repo after add and sync. */
	ignore: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type VendoredRepo = typeof VendoredRepo.Type;

export const Manifest = Schema.Struct({
	$schema: Schema.String.pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(MANIFEST_SCHEMA_URL)),
	),
	dir: Schema.NonEmptyString,
	/** Whether to maintain the managed vendor-src block in the root AGENTS.md. */
	rootAgentsMd: Schema.Boolean,
	repos: Schema.Record(Schema.String, VendoredRepo),
});
export type Manifest = typeof Manifest.Type;

/** `vendor-src.json` file contents, tab-indented like the files we write. */
export const ManifestJson = Schema.fromJsonString(Manifest, { space: "\t" });

export class ManifestError extends Schema.TaggedError<ManifestError>()(
	"ManifestError",
	{
		path: Schema.String,
		reason: Schema.String,
	},
) {
	override get message() {
		return `${this.path} is invalid: ${this.reason}`;
	}
}

export class ManifestNotFoundError extends Schema.TaggedError<ManifestNotFoundError>()(
	"ManifestNotFoundError",
	{ root: Schema.String },
) {
	override get message() {
		return `${MANIFEST_FILENAME} not found in ${this.root}; run \`vendor-src init\` first`;
	}
}

export const decodeManifest = Effect.fn("decodeManifest")(function* (
	raw: string,
	path: string = MANIFEST_FILENAME,
) {
	return yield* Schema.decodeEffect(ManifestJson)(raw).pipe(
		Effect.mapError(
			(error) => new ManifestError({ path, reason: error.message }),
		),
	);
});

export const encodeManifest = (manifest: Manifest): string =>
	`${Schema.encodeSync(ManifestJson)(manifest)}\n`;

export const emptyManifest: Manifest = {
	$schema: MANIFEST_SCHEMA_URL,
	dir: DEFAULT_DIR,
	rootAgentsMd: true,
	repos: {},
};

/** The vendor directory without trailing slashes, e.g. `.repos`. */
export const vendorDir = (manifest: Manifest): string =>
	manifest.dir.replace(/\/+$/, "") || DEFAULT_DIR;

/** Project-relative path of a vendored checkout, e.g. `.repos/effect`. */
export const repoPrefix = (manifest: Manifest, name: string): string =>
	`${vendorDir(manifest)}/${name}`;

export const setRepo = (
	manifest: Manifest,
	name: string,
	{ ignore, siblings, ...repo }: VendoredRepo,
): Manifest => ({
	...manifest,
	repos: {
		...manifest.repos,
		[name]: {
			...repo,
			...(siblings && siblings.length > 0 ? { siblings } : {}),
			...(ignore && ignore.length > 0 ? { ignore } : {}),
		},
	},
});

/** Git hosts treat owner/repo case-insensitively; compare URLs the same way. */
const repositoryKey = (url: string) =>
	url
		.trim()
		.toLowerCase()
		.replace(/\/+$/, "")
		.replace(/\.git$/, "");

/** The vendored entry that checks out `url`, if any. */
export const findRepoByUrl = (
	manifest: Manifest,
	url: string,
): readonly [name: string, repo: VendoredRepo] | undefined =>
	Object.entries(manifest.repos).find(
		([, repo]) => repositoryKey(repo.url) === repositoryKey(url),
	);

export interface VendoredPackage {
	/** Checkout name under the vendor dir. */
	readonly name: string;
	readonly repo: VendoredRepo;
	/** Whether this package pins the checkout or rides along as a sibling. */
	readonly role: "pin" | "sibling";
}

/** Where `packageName` is vendored, as the pinning package or a sibling. */
export const findVendoredPackage = (
	manifest: Manifest,
	packageName: string,
): VendoredPackage | undefined => {
	for (const [name, repo] of Object.entries(manifest.repos)) {
		if (repo.package === packageName) {
			return { name, repo, role: "pin" };
		}
		if (repo.siblings?.some((sibling) => sibling.package === packageName)) {
			return { name, repo, role: "sibling" };
		}
	}
	return undefined;
};

export const removeRepo = (manifest: Manifest, name: string): Manifest => ({
	...manifest,
	repos: Record.remove(manifest.repos, name),
});

export interface Drift {
	readonly name: string;
	readonly package: string;
	readonly vendored: string;
	readonly installed: string | undefined;
}

export function findDrift(
	manifest: Manifest,
	installed: ReadonlyMap<string, string>,
): Drift[] {
	return Object.entries(manifest.repos).flatMap(([name, repo]) => {
		const current = installed.get(repo.package);
		return current === repo.version
			? []
			: [
					{
						name,
						package: repo.package,
						vendored: repo.version,
						installed: current,
					},
				];
	});
}
