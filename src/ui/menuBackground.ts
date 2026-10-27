import { SimplexNoise } from '../world/noise';

/** Paisaje de bloques en capas, generado como SVG, para el fondo de los menús. */
export function menuBackground(): string {
  const W = 96;
  const H = 54;
  const noise = new SimplexNoise(20261027);
  const rects: string[] = [];
  const layers = [
    { base: 30, amp: 8, scale: 18, fill: '#4c6e8f', shade: '#43627f' },
    { base: 36, amp: 6, scale: 12, fill: '#3f6a3a', shade: '#2f5530' },
    { base: 42, amp: 4, scale: 9, fill: '#5a8f3c', shade: '#7a5636' },
  ];
  layers.forEach((layer, li) => {
    for (let x = 0; x < W; x++) {
      const top = Math.round(layer.base + noise.noise2(x / layer.scale, li * 10) * layer.amp);
      rects.push(`<rect x="${x}" y="${top}" width="1" height="${H - top}" fill="${layer.shade}"/>`);
      rects.push(`<rect x="${x}" y="${top}" width="1" height="${li === 2 ? 1 : 2}" fill="${layer.fill}"/>`);
    }
  });
  for (let i = 0; i < 7; i++) {
    const x = Math.round(((noise.noise2(i, 3) + 1) / 2) * (W - 12));
    const y = 4 + Math.round(((noise.noise2(i, 7) + 1) / 2) * 12);
    rects.push(`<rect x="${x}" y="${y}" width="${6 + (i % 3) * 3}" height="2" fill="#f4f7fb" opacity="0.85"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d97e6"/><stop offset="1" stop-color="#f2c38a"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#s)"/><rect x="74" y="8" width="7" height="7" fill="#fff3c4"/>${rects.join('')}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
