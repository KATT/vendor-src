#!/usr/bin/env node
import { existsSync } from "node:fs";

// src/ is not published: inside this repo the CLI runs from source, so it never needs a build.
const source = new URL("../src/bin.ts", import.meta.url);
await import(existsSync(source) ? source.href : "../dist/bin.mjs");
