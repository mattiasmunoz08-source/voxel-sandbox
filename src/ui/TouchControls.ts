import type { Input } from '../player/Input';
import { h } from './dom';

/** Captura el puntero si el navegador lo permite (puede fallar con punteros ya liberados). */
function capture(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // Sin captura el control sigue funcionando mientras el dedo no salga del elemento.
  }
}

export interface TouchCallbacks {
  onInventory(): void;
  onPause(): void;
  onDrop(): void;
}

/**
 * Controles en pantalla para pantallas táctiles o navegadores sin captura del ratón:
 * joystick de movimiento, zona para mirar arrastrando y botones de acción.
 */
export class TouchControls {
  readonly root: HTMLDivElement;
  private knob: HTMLDivElement;
  private stickPointer: number | null = null;
  private stickCenter = { x: 0, y: 0 };
  private lookPointer: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private sneakBtn: HTMLButtonElement;
  private sprintBtn: HTMLButtonElement;

  constructor(private input: Input, cb: TouchCallbacks) {
    this.knob = h('div', { class: 'stick-knob' });
    const stick = h('div', { class: 'stick', 'aria-label': 'Joystick de movimiento' }, this.knob);
    const look = h('div', { class: 'look-area', 'aria-hidden': 'true' });

    const hold = (label: string, cls: string, set: (v: boolean) => void, onTap?: () => void) => {
      const b = h('button', { class: `tbtn ${cls}`, type: 'button' }, label);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.classList.add('active');
        set(true);
        onTap?.();
        capture(b, e.pointerId);
      });
      const up = () => {
        b.classList.remove('active');
        set(false);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      return b;
    };
    const tap = (label: string, cls: string, fn: () => void) => {
      const b = h('button', { class: `tbtn ${cls}`, type: 'button' }, label);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        fn();
      });
      return b;
    };
    this.sneakBtn = tap('Agachar', 'small', () => {
      input.virtual.sneak = !input.virtual.sneak;
      this.sneakBtn.classList.toggle('on', input.virtual.sneak);
    });
    this.sprintBtn = tap('Correr', 'small', () => {
      input.virtual.sprint = !input.virtual.sprint;
      this.sprintBtn.classList.toggle('on', input.virtual.sprint);
    });

    this.root = h('div', { class: 'touch', hidden: true },
      look,
      stick,
      h('div', { class: 'touch-top' },
        tap('Inventario', 'small', () => cb.onInventory()),
        tap('Tirar', 'small', () => cb.onDrop()),
        tap('Pausa', 'small', () => cb.onPause()),
      ),
      h('div', { class: 'touch-actions' },
        this.sneakBtn,
        this.sprintBtn,
        hold('Romper', 'big break', (v) => { input.virtual.breaking = v; }, () => input.pushLeftClick()),
        tap('Usar', 'big place', () => input.pushRightClick()),
        hold('Saltar', 'big jump', (v) => { input.virtual.jump = v; }),
      ),
    );

    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      capture(stick, e.pointerId);
      this.stickPointer = e.pointerId;
      const r = stick.getBoundingClientRect();
      this.stickCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this.moveStick(e.clientX, e.clientY);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickPointer) this.moveStick(e.clientX, e.clientY);
    });
    const stickUp = (e: PointerEvent) => {
      if (e.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      input.virtual.moveX = 0;
      input.virtual.moveZ = 0;
      this.knob.style.transform = '';
    };
    stick.addEventListener('pointerup', stickUp);
    stick.addEventListener('pointercancel', stickUp);

    look.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      capture(look, e.pointerId);
      this.lookPointer = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
    });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookPointer) return;
      const scale = e.pointerType === 'touch' ? 2.2 : 1.4;
      input.addLook((e.clientX - this.lookLast.x) * scale, (e.clientY - this.lookLast.y) * scale);
      this.lookLast = { x: e.clientX, y: e.clientY };
    });
    const lookUp = (e: PointerEvent) => {
      if (e.pointerId === this.lookPointer) this.lookPointer = null;
    };
    look.addEventListener('pointerup', lookUp);
    look.addEventListener('pointercancel', lookUp);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private moveStick(x: number, y: number): void {
    const max = 46;
    let dx = x - this.stickCenter.x;
    let dy = y - this.stickCenter.y;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.input.virtual.moveX = dx / max;
    this.input.virtual.moveZ = -dy / max;
  }

  show(v: boolean): void {
    this.root.hidden = !v;
    if (!v) {
      this.input.virtual.moveX = 0;
      this.input.virtual.moveZ = 0;
      this.knob.style.transform = '';
    }
  }

  get visible(): boolean {
    return !this.root.hidden;
  }
}
