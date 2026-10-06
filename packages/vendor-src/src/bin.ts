#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path, Schema } from "effect";
import { Command } from "effect/cli";

import { cli } from "./cli.ts";

const PackageVersion = Schema.fromJsonString(
	Schema.Struct({ version: Schema.String }),
);

/** Read at runtime: releases bump package.json after `dist/` is built. */
const packageVersion = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const file = yield* path.fromFileUrl(
		new URL("../package.json", import.meta.url),
	);
	const { version } = yield* Schema.decodeUnknownEffect(PackageVersion)(
		yield* fs.readFileString(file),
	);
	return version;
}).pipe(Effect.orElseSucceed(() => "0.0.0"));

Effect.gen(function* () {
	const version = yield* packageVersion;
	yield* Command.run(cli(process.cwd()), { version });
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
