import { Effect, Record, Schema } from "effect";

export const MANIFEST_FILENAME = "vendor-src.json";

/**
 * `$schema` written into vendor-src.json. A path into the installed package,
 * so editors validate the file without downloading a schema.
 */
export const MANIFEST_SCHEMA_URL =
	"./node_modules/vendor-src/schema/vendor-src.schema.json";

/** Vendor dir written into a freshly bootstrapped vendor-src.json. */
export const DEFAULT_DIR = ".repos";

export const VendoredRepo = Schema.Struct({
	/**
	 * npm packages whose source lives in this checkout. The first one's
	 * installed version pins `version` and `ref`. Empty when this is a
	 * git-only checkout (vendored by URL + ref, not tied to an install).
	 */
	packages: Schema.Array(Schema.NonEmptyString),
	url: Schema.NonEmptyString,
	version: Schema.NonEmptyString,
	ref: Schema.NonEmptyString,
	/** Path globs to prune from this vendored repo after add and sync. */
	ignore: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type VendoredRepo = typeof VendoredRepo.Type;

/** Whether this checkout is pinned to an installed npm package. */
export const tracksInstalled = (repo: VendoredRepo): boolean =>
	repo.packages.length > 0;

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
	{ ignore, ...repo }: VendoredRepo,
): Manifest => ({
	...manifest,
	repos: {
		...manifest.repos,
		[name]: {
			...repo,
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
	/** Whether this package pins the checkout or shares one pinned by another. */
	readonly role: "pin" | "shared";
}

/**
 * The package whose installed version pins the checkout.
 * Undefined for git-only checkouts (`packages` is empty).
 */
export const pinnedPackage = (repo: VendoredRepo): string | undefined =>
	repo.packages[0];

/** Where `packageName` is vendored, as the pinning package or one sharing the checkout. */
export const findVendoredPackage = (
	manifest: Manifest,
	packageName: string,
): VendoredPackage | undefined => {
	for (const [name, repo] of Object.entries(manifest.repos)) {
		const index = repo.packages.indexOf(packageName);
		if (index !== -1) {
			return { name, repo, role: index === 0 ? "pin" : "shared" };
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
		const pin = pinnedPackage(repo);
		if (pin === undefined) {
			return [];
		}
		const current = installed.get(pin);
		return current === repo.version
			? []
			: [
					{
						name,
						package: pin,
						vendored: repo.version,
						installed: current,
					},
				];
	});
}
