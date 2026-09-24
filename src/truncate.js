// truncate.js — conservative local output cap.
//
// This is NOT a reimplementation of pi's truncator: inside pi the extension uses pi's own
// helpers through ./pi-truncate.js. This module is the backstop used when the pi runtime is
// unavailable (unit tests, CLI use), so the tool can never dump unbounded output even there.
// Policy: keep whole lines that fit within both caps; if even the first line does not fit,
// cut it at the byte limit. Always tell the caller the full output was spilled to a file.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_MAX_BYTES = 51200;
export const DEFAULT_MAX_LINES = 2000;

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function spillToTempFile(content, { prefix = 'figma-output' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'figma-bridge-')); // mkdtemp dirs are 0o700 by definition
  const file = join(dir, `${prefix}.txt`);
  writeFileSync(file, content, { mode: 0o600 });
  return file;
}

export function truncateForTool(content, {
  maxLines = DEFAULT_MAX_LINES,
  maxBytes = DEFAULT_MAX_BYTES,
  spill = spillToTempFile,
} = {}) {
  const totalBytes = Buffer.byteLength(content);
  const lines = content.split('\n');
  // A trailing newline does not start a new line.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const totalLines = lines.length;

  const kept = [];
  let used = 0;
  let partial = false;
  for (const line of lines) {
    if (kept.length >= maxLines) break;
    const cost = Buffer.byteLength(line) + (kept.length ? 1 : 0);
    if (used + cost > maxBytes) {
      // A single line over the byte cap: cut inside it rather than returning nothing.
      if (!kept.length) {
        kept.push(Buffer.from(content, 'utf8').subarray(0, maxBytes).toString('utf8'));
        partial = true;
      }
      break;
    }
    kept.push(line);
    used += cost;
  }

  // Truncation is about what was dropped, so a fully-kept body is returned verbatim
  // (a trailing newline is not a truncation).
  const truncated = partial || kept.length < totalLines;
  if (!truncated) return { text: content, truncation: null, fullOutputPath: null };

  const body = kept.join('\n');
  const outputBytes = Buffer.byteLength(body);
  const fullOutputPath = spill(content);
  const note = `\n\n[Output truncated: ${kept.length} of ${totalLines} lines`
    + ` (${formatSize(outputBytes)} of ${formatSize(totalBytes)}).`
    + ` Full output saved to: ${fullOutputPath}]`;
  return {
    text: body + note,
    truncation: { truncated: true, outputLines: kept.length, totalLines, outputBytes, totalBytes },
    fullOutputPath,
  };
}
