import type { Sound } from '../audio/Sound';
import type { LoadResult, SaveData } from '../save/storage';
import type { Quality, SettingsStore, TouchMode } from '../settings';
import { clear, h } from './dom';

export interface MenuActions {
  continueGame(): void;
  createWorld(name: string, seedText: string): void;
  deleteCorruptSave(): void;
  play(): void;
  resume(): void;
  save(): { ok: boolean; message: string };
  quitToMenu(save: boolean): void;
  respawn(): void;
}

const dateFmt = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });

export const CONTROLS: [string, string][] = [
  ['W A S D / flechas', 'Moverse'],
  ['Ratón', 'Mirar alrededor'],
  ['Espacio', 'Saltar · nadar hacia arriba'],
  ['Mayús', 'Correr (si no tienes mucha hambre)'],
  ['C', 'Agacharse (no caes por los bordes)'],
  ['Clic izquierdo (mantener)', 'Romper bloque · atacar'],
  ['Clic derecho', 'Colocar bloque · comer · usar mesa de trabajo'],
  ['1–9 / rueda del ratón', 'Elegir casilla de la barra rápida'],
  ['E', 'Abrir o cerrar inventario y fabricación'],
  ['Q', 'Tirar el objeto que tienes en la mano'],
  ['Escape', 'Liberar el ratón y pausar'],
];

/** Pantallas de menú: inicio, mundo nuevo, ajustes, controles, pausa, carga y muerte. */
export class Menus {
  readonly root: HTMLDivElement;
  private panel: HTMLDivElement;
  private progressFill: HTMLDivElement | null = null;
  private progressLabel: HTMLParagraphElement | null = null;

  constructor(private settings: SettingsStore, private sound: Sound, private actions: MenuActions) {
    this.panel = h('div', { class: 'panel menu-panel' });
    this.root = h('div', { class: 'overlay menu-overlay' }, this.panel);
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.sound.click();
    });
  }

  private set(menuClass: string, ...children: (Node | null | false)[]): void {
    this.root.hidden = false;
    this.root.className = `overlay menu-overlay ${menuClass}`;
    clear(this.panel);
    for (const c of children) if (c) this.panel.append(c);
    this.progressFill = null;
    this.progressLabel = null;
    const first = this.panel.querySelector<HTMLElement>('button:not([disabled]), input');
    first?.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.hidden = true;
    clear(this.panel);
  }

  private button(label: string, onClick: () => void, opts: { primary?: boolean; disabled?: boolean; sub?: string } = {}): HTMLButtonElement {
    return h('button', { class: `btn ${opts.primary ? 'btn-primary' : ''}`, type: 'button', disabled: opts.disabled, onclick: onClick },
      h('span', {}, label),
      opts.sub ? h('small', {}, opts.sub) : null,
    );
  }

  showMain(save: LoadResult): void {
    const title = h('div', { class: 'logo' },
      h('h1', { class: 'logo-title' }, 'CANTERA'),
      h('p', { class: 'logo-sub' }, 'Explora · Construye · Sobrevive'),
    );
    const canContinue = save.status === 'ok';
    const sub = save.status === 'ok' ? `${save.data.name} · guardado ${dateFmt.format(save.data.savedAt)}` : save.status === 'none' ? 'No hay ninguna partida guardada' : 'El guardado no se puede cargar';
    const corrupt = save.status === 'corrupt'
      ? h('div', { class: 'notice warn', role: 'alert' },
          h('p', {}, `No se pudo cargar tu partida: ${save.reason} No se ha borrado nada.`),
          this.button('Borrar el guardado dañado', () => {
            this.confirm('¿Borrar definitivamente el guardado dañado?', 'Esto no se puede deshacer.', [
              { label: 'Borrar', danger: true, action: () => this.actions.deleteCorruptSave() },
              { label: 'Cancelar', action: () => this.showMain(save) },
            ]);
          }),
        )
      : null;
    this.set('menu-main',
      title,
      h('nav', { class: 'menu-buttons' },
        this.button('Continuar', () => this.actions.continueGame(), { primary: canContinue, disabled: !canContinue, sub }),
        this.button('Nuevo mundo', () => this.showNewWorld(save.status === 'ok' ? save.data : null, save), { primary: !canContinue }),
        this.button('Ajustes', () => this.showSettings(() => this.showMain(save))),
        this.button('Controles', () => this.showControls(() => this.showMain(save))),
      ),
      corrupt,
      h('p', { class: 'menu-foot' }, 'Cantera v0.1 · juego original hecho con Three.js'),
    );
  }

  showNewWorld(existing: SaveData | null, back: LoadResult): void {
    const name = h('input', { id: 'world-name', type: 'text', maxlength: 40, value: 'Mi mundo', autocomplete: 'off' });
    const seed = h('input', { id: 'world-seed', type: 'text', maxlength: 64, placeholder: 'Vacío = aleatoria', autocomplete: 'off' });
    const create = () => {
      const go = () => this.actions.createWorld(name.value.trim() || 'Mi mundo', seed.value.trim());
      if (existing) {
        this.confirm(`¿Reemplazar «${existing.name}»?`, 'Sólo hay un espacio de guardado. El mundo actual se perderá al guardar el nuevo.', [
          { label: 'Crear y reemplazar', danger: true, action: go },
          { label: 'Cancelar', action: () => this.showNewWorld(existing, back) },
        ]);
      } else go();
    };
    const form = h('form', { class: 'form', onsubmit: (e: Event) => { e.preventDefault(); create(); } },
      h('label', { for: 'world-name' }, 'Nombre del mundo'),
      name,
      h('label', { for: 'world-seed' }, 'Semilla (texto o número)'),
      seed,
      h('p', { class: 'hint' }, 'La misma semilla genera siempre el mismo terreno.'),
      existing ? h('p', { class: 'notice warn' }, `Ya tienes un mundo guardado («${existing.name}»). Crear uno nuevo lo reemplazará.`) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Crear mundo'),
        this.button('Volver', () => this.showMain(back)),
      ),
    );
    this.set('menu-sub', h('h2', {}, 'Nuevo mundo'), form);
  }

  showSettings(back: () => void): void {
    const s = this.settings.value;
    const slider = (id: string, label: string, min: number, max: number, step: number, value: number, fmt: (v: number) => string, apply: (v: number) => void) => {
      const out = h('output', { for: id }, fmt(value));
      const input = h('input', { id, type: 'range', min, max, step, value });
      input.addEventListener('input', () => {
        const v = Number(input.value);
        out.textContent = fmt(v);
        apply(v);
      });
      return h('div', { class: 'field' }, h('label', { for: id }, label, out), input);
    };
    const select = <T extends string>(id: string, label: string, options: [T, string][], value: T, apply: (v: T) => void) => {
      const sel = h('select', { id });
      for (const [v, text] of options) sel.append(h('option', { value: v, selected: v === value }, text));
      sel.addEventListener('change', () => apply(sel.value as T));
      return h('div', { class: 'field' }, h('label', { for: id }, label), sel);
    };
    const check = (id: string, label: string, value: boolean, apply: (v: boolean) => void) => {
      const box = h('input', { id, type: 'checkbox', checked: value });
      box.addEventListener('change', () => apply(box.checked));
      return h('div', { class: 'field check' }, box, h('label', { for: id }, label));
    };

    this.set('menu-sub',
      h('h2', {}, 'Ajustes'),
      h('div', { class: 'form settings' },
        slider('set-volume', 'Volumen', 0, 100, 1, Math.round(s.volume * 100), (v) => `${v}%`, (v) => {
          this.settings.update({ volume: v / 100 });
          this.sound.unlock();
        }),
        slider('set-sens', 'Sensibilidad del ratón', 0.2, 3, 0.1, s.sensitivity, (v) => `${v.toFixed(1)}×`, (v) => this.settings.update({ sensitivity: v })),
        check('set-invert', 'Invertir eje vertical', s.invertY, (v) => this.settings.update({ invertY: v })),
        slider('set-fov', 'Campo de visión', 55, 100, 1, s.fov, (v) => `${v}°`, (v) => this.settings.update({ fov: v })),
        slider('set-dist', 'Distancia de visión', 2, 8, 1, s.renderDistance, (v) => `${v} chunks`, (v) => this.settings.update({ renderDistance: v })),
        select<Quality>('set-quality', 'Calidad gráfica', [['low', 'Baja (hojas opacas, sin nubes)'], ['medium', 'Media'], ['high', 'Alta (resolución completa)']], s.quality, (v) => this.settings.update({ quality: v })),
        select<TouchMode>('set-touch', 'Controles en pantalla', [['auto', 'Automático'], ['on', 'Siempre'], ['off', 'Nunca']], s.touchControls, (v) => this.settings.update({ touchControls: v })),
        check('set-debug', 'Mostrar FPS y coordenadas', s.showDebug, (v) => this.settings.update({ showDebug: v })),
        h('p', { class: 'hint' }, 'Los cambios se aplican al momento y se recuerdan en este navegador.'),
        this.button('Volver', back, { primary: true }),
      ),
    );
  }

  showControls(back: () => void): void {
    const table = h('table', { class: 'controls' },
      h('tbody', {}, ...CONTROLS.map(([k, v]) => h('tr', {}, h('th', { scope: 'row' }, h('kbd', {}, k)), h('td', {}, v)))),
    );
    this.set('menu-sub',
      h('h2', {}, 'Controles'),
      table,
      h('div', { class: 'tips' },
        h('h3', {}, 'En pantallas táctiles'),
        h('p', {}, 'Joystick a la izquierda para moverte, arrastra el resto de la pantalla para mirar y usa los botones Romper, Usar y Saltar. Si el navegador no deja capturar el ratón, aparecen los mismos controles.'),
        h('h3', {}, 'Para empezar'),
        h('p', {}, 'Rompe troncos a mano → fabrica tablones → una mesa de trabajo. Colócala, úsala con clic derecho y crea un pico. Con piedra harás mejores herramientas; con carbón, antorchas. De noche salen los rondadores: la luz de las antorchas impide que aparezcan cerca.'),
      ),
      this.button('Volver', back, { primary: true }),
    );
  }

  showLoading(text: string): void {
    const fill = h('div', { class: 'progress-fill' });
    const label = h('p', { class: 'progress-label' }, '0 %');
    const bar = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, fill);
    this.set('menu-loading', h('h2', {}, text), bar, label);
    // set() limpia las referencias; se guardan después de montar la pantalla.
    this.progressFill = fill;
    this.progressLabel = label;
  }

  setProgress(f: number): void {
    if (!this.progressFill || !this.progressLabel) return;
    const pct = Math.round(f * 100);
    this.progressFill.style.width = `${pct}%`;
    this.progressLabel.textContent = `${pct} %`;
    this.progressFill.parentElement?.setAttribute('aria-valuenow', String(pct));
  }

  showReady(worldName: string, isNew: boolean): void {
    this.set('menu-sub',
      h('h2', {}, isNew ? 'Mundo creado' : 'Mundo cargado'),
      h('p', { class: 'lead' }, `«${worldName}» está listo.`),
      h('p', { class: 'hint' }, 'Al entrar se captura el ratón. Pulsa Escape para liberarlo y pausar.'),
      this.button('Entrar al mundo', () => this.actions.play(), { primary: true }),
    );
  }

  showPause(lastSavedAt: number | null, message?: string): void {
    const status = h('p', { class: 'hint save-status', 'aria-live': 'polite' },
      message ?? (lastSavedAt ? `Último guardado: ${dateFmt.format(lastSavedAt)}` : 'Aún no has guardado esta partida.'));
    this.set('menu-sub menu-pause',
      h('h2', {}, 'Pausa'),
      h('nav', { class: 'menu-buttons' },
        this.button('Volver al juego', () => this.actions.resume(), { primary: true }),
        this.button('Guardar partida', () => {
          const res = this.actions.save();
          status.textContent = res.message;
          status.classList.toggle('error', !res.ok);
        }),
        this.button('Ajustes', () => this.showSettings(() => this.showPause(lastSavedAt))),
        this.button('Controles', () => this.showControls(() => this.showPause(lastSavedAt))),
        this.button('Salir al menú principal', () => {
          this.confirm('¿Guardar antes de salir?', 'Si sales sin guardar perderás lo hecho desde el último guardado.', [
            { label: 'Guardar y salir', primary: true, action: () => this.actions.quitToMenu(true) },
            { label: 'Salir sin guardar', danger: true, action: () => this.actions.quitToMenu(false) },
            { label: 'Cancelar', action: () => this.showPause(lastSavedAt) },
          ]);
        }),
      ),
      status,
    );
  }

  showDeath(cause: string): void {
    const text: Record<string, string> = {
      'caída': 'Caíste desde demasiado alto.',
      hambre: 'Te quedaste sin comida.',
      rondador: 'Un rondador te alcanzó en la oscuridad.',
    };
    this.set('menu-sub menu-death',
      h('h2', {}, 'Has caído'),
      h('p', { class: 'lead' }, text[cause] ?? 'Has perdido toda la vida.'),
      h('p', { class: 'hint' }, 'Conservas tu inventario y el mundo sigue igual. Reaparecerás en el punto de inicio.'),
      h('nav', { class: 'menu-buttons' },
        this.button('Reaparecer', () => this.actions.respawn(), { primary: true }),
        this.button('Salir al menú principal', () => this.actions.quitToMenu(true), { sub: 'Se guarda la partida antes de salir' }),
      ),
    );
  }

  showError(title: string, text: string): void {
    this.set('menu-sub', h('h2', {}, title), h('p', { class: 'lead' }, text));
  }

  confirm(title: string, text: string, options: { label: string; action: () => void; danger?: boolean; primary?: boolean }[]): void {
    this.set('menu-sub menu-confirm',
      h('h2', {}, title),
      h('p', { class: 'lead' }, text),
      h('div', { class: 'menu-buttons' },
        ...options.map((o) => h('button', { class: `btn ${o.danger ? 'btn-danger' : o.primary ? 'btn-primary' : ''}`, type: 'button', onclick: o.action }, o.label)),
      ),
    );
  }
}
