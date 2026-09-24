#!/usr/bin/env node
// figma-bridge — CLI for AI agents to read Figma designs without MCP or the desktop app.
// Subcommands: screens | node | images | nodejs
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getScreens, getNode, getImages } from '../src/helpers.js';
import { parseFlags } from '../src/flags.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

const HELP_CMDS = new Set(['help', '-h', '--help']);
const VERSION_CMDS = new Set(['version', '-v', '-V', '--version']);

const USAGE = `figma-bridge — Figma design data for shell-only agents (no MCP, no desktop app)

  figma-bridge screens <fileKey|url>                      list pages + top-level frames
  figma-bridge node <fileKey|url> [nodeId] [--depth 2] [--fields all|layout+text|content|visuals|layout]
  figma-bridge images <fileKey|url> [id1,id2] [-o ./assets] [--format png|svg] [--scale 2]
  figma-bridge nodejs                                     run a JS script from stdin with helpers preloaded
  figma-bridge --help | -h        show this help
  figma-bridge --version | -v     print the version

Flags accept one or two dashes, so -o ./assets and --o ./assets are equivalent.
Full URLs are accepted everywhere: nodeId defaults to the URL's node-id.

nodejs mode helpers: getScreens(ref), getNode(ref, nodeId?, opts),
getImages(ref, ids?, outDir, opts), cliLog(x). Top-level await is supported.

Auth: $FIGMA_API_KEY or ~/.config/figma/api-key.`;

async function main() {
  const argv = process.argv.slice(2);
  const [cmd, ...rest] = argv;
  const { pos, flags } = parseFlags(rest);

  if (cmd === undefined || HELP_CMDS.has(cmd) || flags.help || flags.h) {
    console.log(USAGE);
    return;
  }
  if (VERSION_CMDS.has(cmd) || flags.version || flags.v) {
    console.log(VERSION);
    return;
  }

  switch (cmd) {
    case 'screens': {
      if (!pos[0]) throw new Error('usage: figma-bridge screens <fileKey|url>');
      console.log(await getScreens(pos[0], { depth: flags.depth === true ? undefined : flags.depth }));
      break;
    }
    case 'node': {
      if (!pos[0]) throw new Error('usage: figma-bridge node <fileKey|url> [nodeId]');
      console.log(await getNode(pos[0], pos[1], {
        depth: flags.depth === true ? undefined : flags.depth,
        fields: flags.fields || 'all',
      }));
      break;
    }
    case 'images': {
      if (!pos[0]) throw new Error('usage: figma-bridge images <fileKey|url> [id1,id2]');
      const saved = await getImages(pos[0], pos[1], flags.o || './figma-assets', {
        format: flags.format || 'png',
        scale: flags.scale === undefined ? 2 : Number(flags.scale),
      });
      console.log(saved.join('\n'));
      break;
    }
    case 'nodejs': {
      const script = readFileSync(0, 'utf8');
      const prelude = [
        `import { getScreens, getNode, getImages } from ${JSON.stringify(join(SRC, 'helpers.js'))};`,
        `globalThis.getScreens = getScreens; globalThis.getNode = getNode; globalThis.getImages = getImages;`,
        `globalThis.cliLog = (...a) => console.log(...a.map(x => typeof x === 'string' ? x : JSON.stringify(x, null, 1)));`,
      ].join('\n');
      const dir = mkdtempSync(join(tmpdir(), 'figma-bridge-'));
      const file = join(dir, 'script.mjs');
      writeFileSync(file, prelude + '\n' + script);
      const r = spawnSync(process.execPath, [file], { stdio: 'inherit' });
      rmSync(dir, { recursive: true, force: true });
      process.exit(r.status ?? 1);
    }
    default:
      console.error(`figma-bridge: unknown command '${cmd}'\n`);
      console.error(USAGE);
      process.exit(1);
  }
}

main().catch((e) => { console.error('figma-bridge: ' + e.message); process.exit(1); });
