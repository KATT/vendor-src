import { Effect, Schema } from "effect";

/** A JSON/JSONC config file in the project could not be parsed. */
export class ConfigFileError extends Schema.TaggedError<ConfigFileError>()(
	"ConfigFileError",
	{
		file: Schema.String,
		cause: Schema.Defect(),
	},
) {
	override get message() {
		const detail =
			this.cause instanceof Error ? this.cause.message : String(this.cause);
		return `${this.file} could not be parsed; fix it before running vendor-src (${detail})`;
	}
}

const JsonObject = Schema.fromJsonString(
	Schema.Record(Schema.String, Schema.Unknown),
);

/** Parse a JSON or JSONC object, failing with {@link ConfigFileError}. */
export const decodeJsonObject = Effect.fnUntraced(function* (
	file: string,
	text: string,
) {
	return yield* Schema.decodeUnknownEffect(JsonObject)(stripJsonc(text)).pipe(
		Effect.mapError((cause) => new ConfigFileError({ file, cause })),
	);
});

/** Serialize with the indentation already used by `original` (tabs by default). */
export function stringifyJson(value: unknown, original?: string): string {
	return `${JSON.stringify(value, null, detectIndent(original ?? ""))}\n`;
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
