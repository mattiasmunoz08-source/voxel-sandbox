# Cantera

Sandbox voxel 3D para el navegador: explora un mundo de bloques generado por semilla, rompe y coloca bloques, fabrica herramientas, come para no pasar hambre y sobrevive a las criaturas que salen de noche. Todas las texturas, iconos y sonidos se generan por código; no usa recursos de otros juegos.

Hecho con **Vite + TypeScript + Three.js**, con HTML y CSS para menús e interfaz.

**Jugar ahora:** https://voxel-sandbox-gamma.vercel.app

## Requisitos

- Node.js 20.19 o superior (probado con Node 24.22.1 LTS).
- Un navegador con WebGL (Chrome, Edge, Firefox o Safari recientes).

## Instalación y ejecución local

```bash
npm install
npm run dev
```

Abre la dirección que muestra la terminal (por defecto http://127.0.0.1:5190).

Otros comandos:

| Comando | Qué hace |
| --- | --- |
| `npm run build` | Comprueba tipos (`tsc --noEmit`) y genera la versión de producción en `dist/` |
| `npm run preview` | Sirve `dist/` en http://127.0.0.1:5191 para probar el build |
| `npm run typecheck` | Sólo comprobación de tipos |

## Controles

| Tecla | Acción |
| --- | --- |
| W A S D / flechas | Moverse |
| Ratón | Mirar |
| Espacio | Saltar · nadar hacia arriba |
| Mayús | Correr (si el hambre es mayor que 6) |
| C | Agacharse (no caes por los bordes) |
| Clic izquierdo (mantener) | Romper bloque · atacar |
| Clic derecho | Colocar bloque · comer · usar la mesa de trabajo |
| 1–9 / rueda | Elegir casilla de la barra rápida |
| E | Inventario y fabricación |
| Q | Tirar el objeto de la mano |
| Escape | Liberar el ratón y pausar |

En el inventario: arrastra para mover o intercambiar, arrastra con clic derecho para repartir la mitad de un montón, **Mayús + clic** pasa objetos entre mochila y barra rápida, y la zona «Suelta aquí» tira objetos al suelo.

**Controles en pantalla.** En pantallas táctiles, o si el navegador no permite capturar el ratón, aparecen un joystick, una zona para mirar arrastrando y botones (Romper, Usar, Saltar, Agachar, Correr, Inventario, Tirar, Pausa). Se pueden forzar o desactivar en *Ajustes → Controles en pantalla*.

## Funciones implementadas

**Mundo**
- Terreno por chunks de 16×16×96 generado con ruido simplex a partir de una semilla (texto o número): la misma semilla da siempre el mismo mundo.
- Biomas: llanura, bosque, desierto, tundra nevada y montaña, con tintes de césped y hojas distintos; lagos y mares, playas, cuevas, vetas de carbón, árboles, cactus, flores, hierba alta y arbustos de bayas.
- Una malla por chunk con sólo las caras visibles, oclusión ambiental por vértice, luz del cielo y luz de antorchas propagada por bloques.
- Carga y descarga progresiva de chunks alrededor del jugador con presupuesto de tiempo por fotograma; pantalla de carga al generar.
- Cielo con degradado, sol y luna, estrellas, nubes en movimiento, niebla y ciclo de día y noche (10 minutos por día).

**Jugador e interacción**
- Primera persona con colisiones por ejes contra bloques sólidos, salto, carrera, agacharse con protección de bordes y natación.
- Mira central, contorno del bloque apuntado, grietas progresivas al romper y partículas.
- Tiempo de rotura según dureza y herramienta; piedra, roca, arenisca y carbón sólo sueltan algo con pico.
- No se puede colocar un bloque sólido dentro del jugador ni de un enemigo; las plantas necesitan tierra o césped debajo; lo que se apoya en un bloque roto cae con él.

**Inventario y fabricación**
- 36 casillas (9 de barra rápida) con icono, cantidad, nombre y desgaste de herramientas.
- Recetas a mano: tablones, palos, mesa de trabajo y antorchas. Con mesa de trabajo (clic derecho sobre ella): picos, hachas, palas y espadas de madera y de piedra, ladrillo de piedra, arenisca, arenisca tallada y tarta de bayas.
- La fabricación comprueba ingredientes y estación, los descuenta y entrega el resultado (lo que no cabe cae al suelo).

**Supervivencia**
- Vida y hambre (10 corazones y 10 raciones). El hambre baja al moverse, correr, saltar, picar y pelear; con hambre alta se regenera vida, con hambre 0 se pierde.
- Comida: manzanas (de las hojas), bayas (de arbustos y a veces de la hierba) y tarta de bayas.
- Daño por caída a partir de ~3,5 bloques.
- Rondadores: criaturas nocturnas que aparecen en zonas oscuras, persiguen y golpean; las antorchas impiden que aparezcan cerca y se deshacen con la luz del día. Se combaten con cualquier herramienta (las espadas hacen más daño) y dan experiencia.
- Experiencia y nivel (minar carbón, derrotar rondadores).
- Al morir se reaparece en el punto de inicio conservando el inventario; el mundo no se toca.

**Interfaz y guardado**
- Menú inicial (Continuar, Nuevo mundo, Ajustes, Controles), pausa (volver, guardar, ajustes, controles, salir), pantalla de muerte.
- Ajustes guardados en el navegador: volumen, sensibilidad, invertir eje Y, campo de visión, distancia de visión (2–8 chunks), calidad gráfica, controles en pantalla y panel de FPS/coordenadas.
- Guardado en `localStorage`: nombre, semilla, hora y día, posición, vida, hambre, experiencia, inventario y todos los bloques modificados. Guardado manual, automático cada 2 minutos y al cerrar la pestaña.
- Los datos guardados se validan: si están dañados se avisa, se desactiva «Continuar» y no se borra nada sin confirmación. Crear un mundo nuevo pide confirmación antes de reemplazar el existente.

## Estructura

```
src/
  main.ts            Arranque, menús y ciclo de vida de la partida
  game/Game.ts       Bucle principal, interacción, combate, guardado
  world/             Bloques, generación por semilla, chunks, mallado, mundo
  player/            Entrada, jugador y física, raycast
  entities/          Física compartida, enemigos, objetos tirados
  items/             Objetos, inventario, recetas
  render/            Atlas de texturas e iconos generados, material de chunks, cielo, partículas, selección, objeto en mano
  ui/                HUD, inventario, menús, controles táctiles
  audio/Sound.ts     Efectos sintetizados con Web Audio
  save/storage.ts    Guardado y validación
  settings.ts        Ajustes persistentes
```

## Pendiente y limitaciones conocidas

- El agua no fluye: es estática (un hueco junto al agua se inunda, pero no se propaga más).
- La luz del cielo es aproximada (por altura de columna, sin propagación lateral); la de las antorchas sí se propaga.
- No hay horno ni otros minerales aparte del carbón, ni animales pacíficos.
- Los objetos tirados y los enemigos no se guardan.
- Un único espacio de guardado.
- La generación y el mallado van en el hilo principal: romper o colocar bloques cuesta ~7–10 ms (puede notarse un pequeño tirón en equipos lentos). Pasarlo a Web Workers es la mejora natural.
- Probado en Chromium de escritorio y con emulación móvil. La captura del ratón no se pudo probar en el navegador automatizado (se probaron los controles alternativos); no se ha probado aún en Safari, Firefox ni en un teléfono real.

## Despliegue

El proyecto está preparado para Vercel (`vercel.json`): instala con `npm ci`, construye con `npm run build` y publica `dist/`. Todas las rutas se reescriben a `index.html`, así que recargar cualquier URL funciona. No hace falta ninguna variable de entorno ni clave.

Para actualizar el juego publicado basta con subir cambios a la rama `main`:

```bash
git add -A
git commit -m "Describe el cambio"
git push
```

Vercel compila y publica automáticamente cada push a `main`; las ramas y pull requests generan despliegues de vista previa.
