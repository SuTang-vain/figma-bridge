// pi-package.test.js — guardrails for the pi packaging surface: manifest, layout, tarball.
// These are the rules from pi.dev/docs/latest/packages that a wrong edit would silently break.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

test('the package is discoverable as a pi package', () => {
  // The gallery lists packages tagged with pi-package; nothing else is required.
  assert.ok(pkg.keywords.includes('pi-package'), 'keywords must include pi-package');
});

test('the pi manifest points at directories that exist', () => {
  assert.ok(pkg.pi, 'package.json needs a "pi" manifest');
  for (const kind of ['extensions', 'skills']) {
    const entries = pkg.pi[kind];
    assert.ok(Array.isArray(entries) && entries.length > 0, `pi.${kind} must be a non-empty array`);
    for (const entry of entries) {
      assert.ok(existsSync(resolve(ROOT, entry)), `pi.${kind} entry does not exist: ${entry}`);
    }
  }
  if (pkg.pi.image) {
    // Gallery previews are https URLs; a relative path is unsupported.
    assert.match(pkg.pi.image, /^https:\/\//, 'pi.image must be an absolute https URL');
  }
});

test('every extension entry is loadable and the skill is well-formed', () => {
  for (const dir of pkg.pi.extensions) {
    const abs = resolve(ROOT, dir);
    const files = readdirSync(abs).filter((f) => /\.(js|mjs|ts)$/.test(f));
    assert.ok(files.length > 0, `${dir} has no loadable extension files`);
  }
  for (const dir of pkg.pi.skills) {
    const skills = readdirSync(resolve(ROOT, dir)).filter((name) => existsSync(join(ROOT, dir, name, 'SKILL.md')));
    assert.ok(skills.length > 0, `${dir} contains no <name>/SKILL.md`);
    for (const name of skills) {
      const skill = readFileSync(join(ROOT, dir, name, 'SKILL.md'), 'utf8');
      assert.match(skill, /^---\n[\s\S]*?\bname:\s*\S+/m, `${name}/SKILL.md needs frontmatter with name`);
      assert.match(skill, /^---\n[\s\S]*?\bdescription:\s*\S+/m, `${name}/SKILL.md needs frontmatter with description`);
    }
  }
});

test('a package skill must not sit at the package root', () => {
  // pi only discovers skills/<name>/SKILL.md (or pi.skills entries), never a root SKILL.md.
  assert.equal(existsSync(join(ROOT, 'SKILL.md')), false, 'move SKILL.md into skills/<name>/');
});

test('bin paths are bare (no ./ prefix) to avoid lockfile churn', () => {
  for (const [name, target] of Object.entries(pkg.bin || {})) {
    assert.ok(!target.startsWith('./'), `bin.${name} must not start with ./`);
  }
});

test('typebox is a runtime dependency, pi core is an optional peer', () => {
  // The extension imports typebox statically, so it must always resolve. Pi core is loaded
  // dynamically and pi provides it, so it stays an optional peer (and is never auto-installed
  // for plain CLI users).
  assert.ok(pkg.dependencies?.typebox, 'typebox must be a runtime dependency');
  assert.equal(pkg.peerDependencies?.typebox, undefined, 'typebox must not be a peer');
  assert.ok(pkg.peerDependencies?.['@earendil-works/pi-coding-agent'], 'pi core must be a peerDependency');
  assert.equal(pkg.peerDependenciesMeta?.['@earendil-works/pi-coding-agent']?.optional, true);
  assert.equal(pkg.dependencies?.['@earendil-works/pi-coding-agent'], undefined);
});

test('files ships what the extension and skill need at runtime', () => {
  for (const required of ['bin', 'src', 'extensions', 'skills', 'BENCHMARKS.md']) {
    assert.ok(pkg.files.includes(required), `files must include ${required}`);
  }
});

test('the packed tarball contains skills/ and extensions/', () => {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: ROOT, encoding: 'utf8' });
  const paths = JSON.parse(out)[0].files.map((f) => f.path);
  assert.ok(paths.some((p) => p.startsWith('skills/')), paths.join(','));
  assert.ok(paths.some((p) => p.startsWith('extensions/')), paths.join(','));
  assert.ok(paths.includes('skills/figma-bridge/SKILL.md'), 'SKILL.md must be inside the package');
});

test('README relative links resolve to files that exist', () => {
  for (const doc of ['README.md', 'README.zh-CN.md']) {
    const text = readFileSync(join(ROOT, doc), 'utf8');
    for (const target of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const href = target[1];
      if (/^(https?:|mailto:|#)/.test(href)) continue;
      const path = resolve(ROOT, href.replace(/^\.\//, ''));
      assert.ok(existsSync(path), `${doc} links to a missing file: ${href}`);
    }
  }
});

test('the extension registers exactly one compact tool', async () => {
  const { default: figmaExtension } = await import('../extensions/figma.js');
  const registered = [];
  const fakePi = { registerTool: (definition) => registered.push(definition) };

  await figmaExtension(fakePi, {
    piCore: null, // no pi runtime needed for this check
    getScreens: async () => 'screens',
    getNode: async () => 'node',
    getImages: async () => [],
  });

  assert.equal(registered.length, 1, 'the whole point is a minimal tool surface');
  assert.equal(registered[0].name, 'figma');
  assert.equal(typeof registered[0].execute, 'function');
  const res = await registered[0].execute('id', { mode: 'screens', ref: 'KEY' }, null, null, { cwd: ROOT });
  assert.equal(res.content[0].text, 'screens');
});
