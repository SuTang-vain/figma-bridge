// pi-truncate.js — adapters that keep tool output bounded.
//
// Preferred path (inside pi): use pi's own truncation helpers, which the docs require tools
// to use, so limits and note format stay in sync with the host:
//   https://pi.dev/docs/latest/extensions#output-truncation
// Backstop (no pi runtime: unit tests, CLI use): ./truncate.js applies a conservative cap so
// output can never be unbounded.
import { truncateForTool as localTruncate, spillToTempFile } from './truncate.js';

export function createTruncator(piCore, { spill = spillToTempFile } = {}) {
  const { truncateHead, formatSize, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } = piCore || {};

  if (typeof truncateHead !== 'function') {
    return (text, options = {}) => localTruncate(text, { spill, ...options });
  }

  return (text, { maxLines = DEFAULT_MAX_LINES, maxBytes = DEFAULT_MAX_BYTES } = {}) => {
    const truncation = truncateHead(text, { maxLines, maxBytes });
    if (!truncation.truncated) return { text, truncation, fullOutputPath: null };

    const fullOutputPath = spill(text);
    const note = `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines`
      + ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`
      + ` Full output saved to: ${fullOutputPath}]`;
    return { text: truncation.content + note, truncation, fullOutputPath };
  };
}
