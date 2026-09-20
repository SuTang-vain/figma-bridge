// flags.js — argv parsing for the CLI: positionals plus long (--name) and short (-n) options.
// The token after an option becomes its value unless it is missing or itself option-like,
// in which case the option is boolean. A lone "-" is treated as a value, not an option.

const OPTION = /^--?([A-Za-z][\w-]*)$/;

const optionLike = (s) => s.startsWith('-') && s !== '-';

export function parseFlags(args) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const m = OPTION.exec(args[i]);
    if (!m) {
      pos.push(args[i]);
      continue;
    }
    const next = args[i + 1];
    if (next !== undefined && !optionLike(next)) {
      flags[m[1]] = next;
      i++;
    } else {
      flags[m[1]] = true;
    }
  }
  return { pos, flags };
}
