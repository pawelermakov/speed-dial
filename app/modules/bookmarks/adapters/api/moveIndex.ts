// Native Chromium counts the destination before removing the source node.
export function nativeMoveIndex(from: number, to: number) {
  return to + Number(import.meta.env.BROWSER === 'chrome' && from < to);
}
