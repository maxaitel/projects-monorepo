#!/usr/bin/env node

import { runCli } from '../src/media-to-gif.js';
import path from 'node:path';

const commandName = path.basename(process.argv[1], '.js');
const exitCode = await runCli(process.argv.slice(2), { commandName });
process.exitCode = exitCode;
