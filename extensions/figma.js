// extensions/figma.js — pi extension entry point.
//
// Pi calls the default export with its ExtensionAPI (async factories are supported, see
// docs/extensions.md "Async factory functions"). This extension registers exactly one tool.
//
// pi core is imported dynamically and is optional on purpose: when pi is absent (tests, plain
// CLI use) the tool still works with the conservative local truncator, so this file stays
// importable without the pi runtime installed.
import { getScreens, getNode, getImages } from '../src/helpers.js';
import { createFigmaTool } from '../src/figma-tool.js';
import { createTruncator } from '../src/pi-truncate.js';

async function loadPiCore() {
  try {
    return await import('@earendil-works/pi-coding-agent');
  } catch {
    return null;
  }
}

export default async function figmaExtension(pi, deps = {}) {
  const core = deps.piCore !== undefined ? deps.piCore : await loadPiCore();
  const truncate = deps.truncate || createTruncator(core);

  pi.registerTool(createFigmaTool({
    getScreens: deps.getScreens || getScreens,
    getNode: deps.getNode || getNode,
    getImages: deps.getImages || getImages,
    truncate,
  }));
}
