/** Estado de teclado, ratón y controles en pantalla, leído una vez por fotograma. */
export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheel = 0;
  private leftClicks = 0;
  private rightClicks = 0;
  leftDown = false;
  rightDown = false;

  /** Controles en pantalla (táctiles o con ratón sin captura). */
  readonly virtual = {
    moveX: 0,
    moveZ: 0,
    jump: false,
    sneak: false,
    sprint: false,
    breaking: false,
  };

  /** Sólo se capturan acciones de juego cuando no hay menús abiertos. */
  active = false;
  pointerLocked = false;

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (!this.active) return;
    if (e.ctrlKey || e.metaKey) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
    if (!e.repeat) this.pressed.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private readonly onMouseDown = (e: MouseEvent) => {
    if (!this.active || !this.pointerLocked) return;
    if (e.button === 0) {
      this.leftDown = true;
      this.leftClicks++;
    } else if (e.button === 2) {
      this.rightDown = true;
      this.rightClicks++;
    }
  };

  private readonly onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.leftDown = false;
    else if (e.button === 2) this.rightDown = false;
  };

  private readonly onMouseMove = (e: MouseEvent) => {
    if (!this.active || !this.pointerLocked) return;
    // Algunos navegadores envían un salto enorme al capturar el ratón; se descarta.
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private readonly onWheel = (e: WheelEvent) => {
    if (!this.active) return;
    this.wheel += Math.sign(e.deltaY);
  };

  private readonly onBlur = () => this.releaseAll();

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.onBlur);
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  consumePress(code: string): boolean {
    return this.pressed.delete(code);
  }

  consumeLeftClick(): boolean {
    if (this.leftClicks === 0) return false;
    this.leftClicks = 0;
    return true;
  }

  consumeRightClick(): boolean {
    if (this.rightClicks === 0) return false;
    this.rightClicks = 0;
    return true;
  }

  /** Clic derecho simulado por el botón «Colocar» en pantalla. */
  pushRightClick(): void {
    this.rightClicks++;
  }

  /** Clic izquierdo simulado (golpe inmediato) por el botón «Romper». */
  pushLeftClick(): void {
    this.leftClicks++;
  }

  addLook(dx: number, dy: number): void {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  takeLook(): [number, number] {
    const d: [number, number] = [this.mouseDX, this.mouseDY];
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  takeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Eje de movimiento combinado: x = lateral (derecha +), z = avance (adelante +). */
  moveAxes(): { x: number; z: number } {
    let x = this.virtual.moveX;
    let z = this.virtual.moveZ;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    return { x, z };
  }

  get jump(): boolean {
    return this.keys.has('Space') || this.virtual.jump;
  }

  get sneak(): boolean {
    return this.keys.has('KeyC') || this.virtual.sneak;
  }

  get sprint(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.virtual.sprint;
  }

  get breaking(): boolean {
    return this.leftDown || this.virtual.breaking;
  }

  /** Suelta todo (al pausar o perder el foco) para que el jugador no siga andando. */
  releaseAll(): void {
    this.keys.clear();
    this.pressed.clear();
    this.leftDown = false;
    this.rightDown = false;
    this.leftClicks = 0;
    this.rightClicks = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.virtual.moveX = 0;
    this.virtual.moveZ = 0;
    this.virtual.jump = false;
    this.virtual.breaking = false;
  }
}
