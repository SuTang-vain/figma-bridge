#!/usr/bin/env node
// figma-bridge — CLI for AI agents to read Figma designs without MCP or the desktop app.
// Subcommands: screens | node | images | nodejs
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getScreens, getNode, getImages } from '../src/helpers.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function parseFlags(args) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; }
      else flags[key] = true;
    } else pos.push(args[i]);
  }
  return { pos, flags };
}

const USAGE = `figma-bridge — Figma design data for shell-only agents (no MCP, no desktop app)

  figma-bridge screens <fileKey>                         list pages + top-level frames
  figma-bridge node <fileKey> <nodeId> [--depth 2] [--fields all|layout+text|content|visuals|layout]
  figma-bridge images <fileKey> <id1,id2> [-o ./assets] [--format png|svg] [--scale 2]
  figma-bridge nodejs                                    run a JS script from stdin with helpers preloaded

nodejs mode helpers: getScreens(fileKey), getNode(fileKey, nodeId, opts),
getImages(fileKey, ids, outDir, opts), cliLog(x). Top-level await is supported.

fileKey: the segment after /design/ in a Figma URL; nodeId: 1-4 in the URL is "1:4" here.
Auth: $FIGMA_API_KEY or ~/.config/figma/api-key.`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, flags } = parseFlags(rest);

  switch (cmd) {
    case 'screens': {
      if (!pos[0]) throw new Error('usage: figma-bridge screens <fileKey>');
      console.log(await getScreens(pos[0], { depth: Number(flags.depth) || 2 }));
      break;
    }
    case 'node': {
      if (!pos[0] || !pos[1]) throw new Error('usage: figma-bridge node <fileKey> <nodeId>');
      console.log(await getNode(pos[0], pos[1], {
        depth: flags.depth !== undefined ? Number(flags.depth) : 2,
        fields: flags.fields || 'all',
      }));
      break;
    }
    case 'images': {
      if (!pos[0] || !pos[1]) throw new Error('usage: figma-bridge images <fileKey> <id1,id2>');
      const saved = await getImages(pos[0], pos[1], flags.o || './figma-assets', {
        format: flags.format || 'png',
        scale: Number(flags.scale) || 2,
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
      console.log(USAGE);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => { console.error('figma-bridge: ' + e.message); process.exit(1); });
