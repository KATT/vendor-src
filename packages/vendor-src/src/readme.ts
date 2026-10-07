import { Console, Effect, Option } from "effect";
import { CliOutput, type HelpDoc } from "effect/cli";

import { run } from "./cli.ts";

export const COMMANDS_START = "<!-- commands:start -->";
export const COMMANDS_END = "<!-- commands:end -->";

const quietConsole = { ...globalThis.console, log() {} };

/** The help `vendor-src <args> --help` would print, as structured data. */
const helpDoc = Effect.fnUntraced(function* (args: ReadonlyArray<string>) {
	let captured: HelpDoc.HelpDoc | undefined;
	const formatter: CliOutput.Formatter = {
		...CliOutput.defaultFormatter({ colors: false }),
		formatHelpDoc: (doc) => {
			captured = doc;
			return "";
		},
	};
	yield* run([...args, "--help"], { version: "0.0.0" }).pipe(
		Effect.provide(CliOutput.layer(formatter)),
		Effect.provideService(Console.Console, quietConsole),
	);
	if (captured === undefined) {
		return yield* Effect.die(`no help printed for: ${args.join(" ")}`);
	}
	return captured;
});

const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

const describe = (description: Option.Option<string>) =>
	Option.match(description, {
		onNone: () => "",
		onSome: (text) => `: ${sentence(text)}`,
	});

const argLabel = (arg: HelpDoc.ArgDoc) => {
	const name = arg.variadic ? `${arg.name}...` : arg.name;
	return arg.required ? `<${name}>` : `[${name}]`;
};

const flagLabel = (flag: HelpDoc.FlagDoc) =>
	flag.type === "boolean" ? `--${flag.name}` : `--${flag.name} <value>`;

const renderCommand = (
	command: HelpDoc.SubcommandDoc,
	doc: HelpDoc.HelpDoc,
) => {
	const args = doc.args ?? [];
	const heading = ["vendor-src", command.name, ...args.map(argLabel)].join(" ");
	const alias =
		command.alias === undefined ? "" : ` Alias: \`${command.alias}\`.`;
	const lines = [
		`### \`${heading}\``,
		"",
		`${sentence(doc.description)}${alias}`,
	];

	const options = [
		...args.map((arg) => `- \`${argLabel(arg)}\`${describe(arg.description)}`),
		...doc.flags.map(
			(flag) => `- \`${flagLabel(flag)}\`${describe(flag.description)}`,
		),
	];
	if (options.length > 0) {
		lines.push("", ...options);
	}

	const examples = doc.examples ?? [];
	if (examples.length > 0) {
		lines.push(
			"",
			"```shell",
			examples
				.map((example) =>
					example.description === undefined
						? example.command
						: `# ${example.description}\n${example.command}`,
				)
				.join("\n\n"),
			"```",
		);
	}
	return lines.join("\n");
};

/** Markdown reference for every subcommand, rendered from the CLI's own help. */
export const renderCommandReference = Effect.gen(function* () {
	const root = yield* helpDoc([]);
	const commands = (root.subcommands ?? []).flatMap((group) => group.commands);
	const sections: string[] = [];
	for (const command of commands) {
		sections.push(renderCommand(command, yield* helpDoc([command.name])));
	}
	return sections.join("\n\n");
});

/** Replace the text between the command-reference markers in `readme`. */
export const replaceCommandReference = (readme: string, reference: string) => {
	const start = readme.indexOf(COMMANDS_START);
	const end = readme.indexOf(COMMANDS_END);
	if (start === -1 || end < start) {
		throw new Error(
			`README.md needs ${COMMANDS_START} and ${COMMANDS_END} markers`,
		);
	}
	return `${readme.slice(0, start + COMMANDS_START.length)}\n\n${reference}\n\n${readme.slice(end)}`;
};
