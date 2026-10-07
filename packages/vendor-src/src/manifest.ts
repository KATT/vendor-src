import { Effect, Record, Schema } from "effect";

export const MANIFEST_FILENAME = "vendor-src.json";

/** Published schema URL for `$schema` in vendor-src.json (resolves via package export). */
export const MANIFEST_SCHEMA_URL = "https://unpkg.com/vendor-src/schema.json";

/** Vendor dir written into a freshly bootstrapped vendor-src.json. */
export const DEFAULT_DIR = ".repos";

export const VendoredRepo = Schema.Struct({
	package: Schema.NonEmptyString,
	url: Schema.NonEmptyString,
	version: Schema.NonEmptyString,
	ref: Schema.NonEmptyString,
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
		[name]: ignore && ignore.length > 0 ? { ...repo, ignore } : repo,
	},
});

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
