// url.js — accept Figma URLs anywhere a fileKey/nodeId is expected.
// URL form: https://www.figma.com/design/<fileKey>/<slug>?node-id=1-4 → nodeId "1:4"
export function parseFigmaUrl(input) {
  if (!/^https?:\/\//i.test(input)) return { fileKey: input };
  let u;
  try {
    u = new URL(input);
  } catch {
    return { fileKey: input };
  }
  const m = u.pathname.match(/\/(?:design|file|board|proto)\/([A-Za-z0-9]+)/);
  const nid = u.searchParams.get('node-id');
  return {
    fileKey: m ? m[1] : input,
    nodeId: nid ? nid.replace(/-/g, ':') : undefined,
  };
}
