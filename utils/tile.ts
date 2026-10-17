export function tileHostname(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') || 'Сайт'; }
  catch { return 'Сайт'; }
}

export function tileColor(hostname: string): string {
  let hash = 2166136261;
  for (let i = 0; i < hostname.length; i++) hash = Math.imul(hash ^ hostname.charCodeAt(i), 16777619);
  const seed = hash >>> 0;
  const hue = seed % 360;
  const saturation = (32 + ((seed >>> 9) % 17)) / 100;
  const lightness = (32 + ((seed >>> 17) % 11)) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const offset = lightness - chroma / 2;
  const sectors = [
    [chroma, secondary, 0], [secondary, chroma, 0], [0, chroma, secondary],
    [0, secondary, chroma], [secondary, 0, chroma], [chroma, 0, secondary],
  ];
  return readableColor(sectors[Math.floor(hue / 60)]!.map(channel => Math.round((channel + offset) * 255)));
}

function readableColor(rgb: number[], maximumLuminance = 1.05 / 4.5 - 0.05): string {
  const readable = (channels: number[]) => {
    const linear = channels.map(channel => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const luminance = linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
    return luminance <= maximumLuminance;
  };
  // Keep the original color whenever possible; otherwise find the smallest
  // proportional darkening that gives white text sufficient contrast.
  if (!readable(rgb)) {
    let low = 0, high = 1;
    for (let i = 0; i < 16; i++) {
      const middle = (low + high) / 2;
      if (readable(rgb.map(channel => Math.round(channel * middle)))) low = middle;
      else high = middle;
    }
    rgb = rgb.map(channel => Math.round(channel * low));
  }
  return '#' + rgb.map(channel => channel.toString(16).padStart(2, '0')).join('');
}

// Quantize colors instead of averaging the whole icon into a muddy gray.
export function faviconTileColor(pixels: Uint8ClampedArray): string | undefined {
  const bins = new Map<number, { weight: number; rgb: number[]; chromatic: boolean }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const alpha = pixels[i + 3]! / 255;
    if (alpha < 0.25) continue;
    const rgb = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
    const maximum = Math.max(...rgb), minimum = Math.min(...rgb);
    const chromatic = maximum - minimum > 30 && maximum > 45;
    const key = ((rgb[0]! >> 4) << 8) | ((rgb[1]! >> 4) << 4) | (rgb[2]! >> 4);
    const bin = bins.get(key) ?? { weight: 0, rgb: [0, 0, 0], chromatic };
    bin.weight += alpha;
    for (let j = 0; j < 3; j++) bin.rgb[j]! += rgb[j]! * alpha;
    bins.set(key, bin);
  }
  const rows = [...bins.values()];
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  // Prefer a meaningful colored mark over its white/black backing.
  const colored = rows.filter(row => row.chromatic && row.weight >= total * 0.05);
  const dominant = (colored.length ? colored : rows).sort((a, b) => b.weight - a.weight)[0];
  if (!dominant) return undefined;
  const rgb = dominant.rgb.map(channel => Math.round(channel / dominant.weight));
  // One brightness cap for all icons; colors below it remain unchanged.
  return readableColor(rgb, 0.12);
}

export function fitTileFont(width: number, height: number, measure: (size: number) => number): number {
  const minimum = 12;
  let low = minimum, high = Math.max(minimum, Math.min(40, Math.floor(height * 0.28)));
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(middle) <= width) low = middle;
    else high = middle - 1;
  }
  return low;
}

export function fitTileColumns(width: number, requested: number, gap: number): number {
  return Math.max(1, Math.min(requested, Math.floor((width + gap) / (140 + gap))));
}
