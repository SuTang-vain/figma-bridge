// figma-tool.js — the single pi tool this package exposes.
//
// One tool with a `mode` enum rather than three tools: the project's whole pitch is that tool
// schemas are a permanent context tax, so the surface stays as small as possible while keeping
// progressive disclosure (screens -> node -> images) inside the call.
//
// The pi ExtensionAPI is not imported here — it arrives as an argument at registration time —
// so this module stays unit-testable and the package still works as a plain CLI.
import { resolve } from 'node:path';
import { Type } from 'typebox';
import { truncateForTool } from './truncate.js';

export const MODES = ['screens', 'node', 'images'];
export const FIELD_PRESETS = ['all', 'layout+text', 'content', 'visuals', 'layout'];
export const IMAGE_FORMATS = ['png', 'svg', 'jpg', 'pdf'];

export const DESCRIPTION = [
  'Read Figma design data without MCP or the Figma desktop app.',
  'mode=screens lists pages and frames (smallest output), mode=node returns one node subtree',
  'as compact text, mode=images renders and downloads node images.',
  'Uses the Figma REST API with FIGMA_API_KEY or ~/.config/figma/api-key; responses are cached',
  'per file until the file changes. Output is truncated at 50KB/2000 lines.',
].join(' ');

export function createFigmaTool({ getScreens, getNode, getImages, truncate = truncateForTool }) {
  return {
    name: 'figma',
    label: 'Figma',
    description: DESCRIPTION,
    promptSnippet: 'Read Figma designs: list screens, fetch a node subtree, or download rendered images',
    promptGuidelines: [
      'Use figma with mode=screens first to see a file\'s pages and frames cheaply, then mode=node for the specific node you need.',
      'Use figma with mode=images only for nodes you will actually use, and pass outDir to keep assets inside the project.',
    ],
    parameters: Type.Object({
      mode: Type.Union(MODES.map((mode) => Type.Literal(mode)), {
        description: 'screens = page/frame outline; node = one simplified subtree; images = download rendered images',
      }),
      ref: Type.String({ description: 'Figma file key or a full Figma URL' }),
      nodeId: Type.Optional(Type.String({ description: 'Node id like "1:4"; defaults to the URL\'s node-id' })),
      depth: Type.Optional(Type.Number({ description: 'Tree depth, 1-3 (default 2)' })),
      fields: Type.Optional(Type.Union(FIELD_PRESETS.map((preset) => Type.Literal(preset)), {
        description: 'Field preset for mode=node (default all); narrower presets save tokens',
      })),
      nodeIds: Type.Optional(Type.Array(Type.String(), {
        description: 'mode=images: node ids to render (defaults to the ref\'s node-id)',
      })),
      outDir: Type.Optional(Type.String({ description: 'mode=images: output directory (default ./figma-assets)' })),
      format: Type.Optional(Type.Union(IMAGE_FORMATS.map((format) => Type.Literal(format)), {
        description: 'mode=images: file format (default png)',
      })),
      scale: Type.Optional(Type.Number({ description: 'mode=images: raster scale (default 2)' })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx?.cwd || process.cwd();
      const depth = params.depth ?? 2;

      if (params.mode === 'images') {
        const outDir = resolve(cwd, params.outDir || './figma-assets');
        const saved = await getImages(params.ref, params.nodeIds, outDir, {
          format: params.format || 'png',
          scale: params.scale ?? 2,
        });
        const text = saved.length
          ? saved.map((file) => `saved ${file}`).join('\n')
          : 'no images returned for those node ids';
        return { content: [{ type: 'text', text }], details: { mode: params.mode, ref: params.ref, saved } };
      }

      const figure = params.mode === 'screens'
        ? await getScreens(params.ref, { depth })
        : await getNode(params.ref, params.nodeId, { depth, fields: params.fields || 'all' });

      const { text, truncation, fullOutputPath } = truncate(figure);
      return {
        content: [{ type: 'text', text }],
        details: {
          mode: params.mode,
          ref: params.ref,
          ...(fullOutputPath
            ? { truncated: true, fullOutputPath }
            : { truncated: Boolean(truncation?.truncated), bytes: Buffer.byteLength(figure) }),
        },
      };
    },
  };
}
