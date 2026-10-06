import { Effect, Record, Schema } from "effect";

export const MANIFEST_FILENAME = "vendor-src.json";

/** Published schema URL for `$schema` in vendor-src.json (resolves via package export). */
export const MANIFEST_SCHEMA_URL = "https://unpkg.com/vendor-src/schema.json";

export const DEFAULT_DIR = "repos";

export const VendoredRepo = Schema.Struct({
	package: Schema.NonEmptyString,
	url: Schema.NonEmptyString,
	version: Schema.NonEmptyString,
	ref: Schema.NonEmptyString,
	/** Path globs to prune from this vendored repo after subtree add/pull/sync. */
	ignore: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type VendoredRepo = typeof VendoredRepo.Type;

export const Manifest = Schema.Struct({
	$schema: Schema.String.pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(MANIFEST_SCHEMA_URL)),
	),
	dir: Schema.NonEmptyString.pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_DIR)),
	),
	repos: Schema.Record(Schema.String, VendoredRepo).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed({})),
	),
});
export type Manifest = typeof Manifest.Type;

/** `vendor-src.json` contents as a tab-indented JSON string. */
export const ManifestJson = Schema.fromJsonString(Manifest, { space: "\t" });

export class ManifestError extends Schema.TaggedError<ManifestError>()(
	"ManifestError",
	{ cause: Schema.Defect() },
) {
	override get message() {
		const detail =
			this.cause instanceof Error ? this.cause.message : String(this.cause);
		return `${MANIFEST_FILENAME} is invalid: ${detail}`;
	}
}

export const decodeManifest = (json: string) =>
	Schema.decodeUnknownEffect(ManifestJson)(json).pipe(
		Effect.mapError((cause) => new ManifestError({ cause })),
	);

export const encodeManifest = (manifest: Manifest) =>
	Schema.encodeEffect(ManifestJson)(manifest).pipe(
		Effect.map((json) => `${json}\n`),
		Effect.orDie,
	);

export const emptyManifest = (): Manifest => ({
	$schema: MANIFEST_SCHEMA_URL,
	dir: DEFAULT_DIR,
	repos: {},
});

/** The vendor directory relative to the project root, without a trailing slash. */
export function vendorDir(manifest: Manifest): string {
	return manifest.dir.replace(/\/+$/, "") || DEFAULT_DIR;
}

/** Project-relative path of a vendored repo, e.g. `repos/effect`. */
export function repoPrefix(manifest: Manifest, name: string): string {
	return `${vendorDir(manifest)}/${name}`;
}

export function setRepo(
	manifest: Manifest,
	name: string,
	repo: VendoredRepo,
): Manifest {
	const { ignore, ...rest } = repo;
	const entry: VendoredRepo =
		ignore && ignore.length > 0 ? { ...rest, ignore: [...ignore] } : rest;
	return { ...manifest, repos: Record.set(manifest.repos, name, entry) };
}

export function removeRepo(manifest: Manifest, name: string): Manifest {
	return { ...manifest, repos: Record.remove(manifest.repos, name) };
}

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
