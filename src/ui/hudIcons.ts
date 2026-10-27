/** Iconos de 9×9 píxeles para vida y hambre, generados una vez como URL de datos. */
const HEART = [
  '.##...##.',
  '#oo#.#oo#',
  '#ooo#ooo#',
  '#ooooooo#',
  '.#ooooo#.',
  '..#ooo#..',
  '...#o#...',
  '....#....',
  '.........',
];

const FOOD = [
  '....#....',
  '...#g....',
  '..###....',
  '.#ooo##..',
  '#ooooooo#',
  '#ooooooo#',
  '#ooooooo#',
  '.#ooooo#.',
  '..#####..',
];

type Fill = 'full' | 'half' | 'empty';

function draw(shape: string[], fill: Fill, colors: { o: string; dark: string; g?: string; empty: string }): string {
  const c = document.createElement('canvas');
  const scale = 3;
  c.width = 9 * scale;
  c.height = 9 * scale;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const ch = shape[y][x];
      if (ch === '.') continue;
      let color: string;
      if (ch === '#') color = '#1b1414';
      else if (ch === 'g') color = colors.g ?? colors.o;
      else {
        const filled = fill === 'full' || (fill === 'half' && x < 5);
        color = filled ? (y <= 2 && x <= 3 ? colors.dark : colors.o) : colors.empty;
      }
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return c.toDataURL();
}

export interface HudIcons {
  heart: Record<Fill, string>;
  food: Record<Fill, string>;
}

export function createHudIcons(): HudIcons {
  const heartColors = { o: '#e2383f', dark: '#ff8a8a', empty: '#4a3434' };
  const foodColors = { o: '#e0a33a', dark: '#ffd27a', g: '#5c9a3a', empty: '#4a4034' };
  return {
    heart: { full: draw(HEART, 'full', heartColors), half: draw(HEART, 'half', heartColors), empty: draw(HEART, 'empty', heartColors) },
    food: { full: draw(FOOD, 'full', foodColors), half: draw(FOOD, 'half', foodColors), empty: draw(FOOD, 'empty', foodColors) },
  };
}
