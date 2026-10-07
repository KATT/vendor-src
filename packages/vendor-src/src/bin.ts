#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path, Schema } from "effect";
import { Command } from "effect/cli";

import { layer, vendorSrc } from "./cli.ts";

const PackageVersion = Schema.fromJsonString(
	Schema.Struct({ version: Schema.String }),
);

/** Read the version at runtime: releases bump package.json after the build. */
const readVersion = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const here = yield* path.fromFileUrl(new URL(import.meta.url));
	const raw = yield* fs.readFileString(
		path.join(path.dirname(here), "..", "package.json"),
	);
	const { version } = yield* Schema.decodeEffect(PackageVersion)(raw);
	return version;
}).pipe(Effect.orElseSucceed(() => "0.0.0"));

Effect.gen(function* () {
	const version = yield* readVersion;
	yield* Command.run(vendorSrc.pipe(Command.provide(layer())), { version });
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
