# DESIGN.md — TurnoExtra (v2 · Fase 2: paleta del código, hero A1 y línea «placa de instrumento» aprobados)

Documento vinculante. Sustituye a la v1 (copia en `DESIGN.v1.md`). Alineado con `TurnoExtra — Diseño MVP v2.md` §1.1 (piloto expositivo: todo se ve funcionando, sin cifras inventadas, estética primero) y §4 (toda vista tiene estados cargando, vacío y error).

Stack: React 19 · Vite · react-router 7 · TanStack Query · CSS plano. Datos siempre vía capa de servicios con `VITE_USE_MOCKS` (ver §9).

## 1. Estética

**Se conserva la identidad actual ("turno de noche"): dibujos 2D, atmósfera y animación.** Lo que cambia es el orden y la legibilidad, no el carácter.

Mezcla: **~40 % Swiss (orden)** + **~35 % ilustración y atmósfera (la firma actual)** + **~25 % tacto y telemetría**.
- *Orden (Swiss):* un solo contenedor, una sola alineación, jerarquía clara. Es lo que arregla el zigzagueo; no quita expresividad.
- *Ilustración y atmósfera (se mantiene):* red de nodos con pulsos, haces de brasa, ventana de panel y teléfono con chat, burbujas, notas pegadas, garabato bajo la palabra clave, grano de película, ola de brasa, logo animado, escenas 2D del super admin armadas con datos reales.
- *Tacto y telemetría (se suma):* botones con relieve, ids/horas/nodos en mono tabular, timeline en vivo.

Regla que no cambia: cada capa decorativa tiene una función y puede desaparecer sin perder contenido. Lo que sí se corrige es que **nada decorativo se superponga a texto o a datos** (ver §5, Hero).

### 1.1 Línea artística aprobada: «placa de instrumento» (aplica a landing, paneles, `/yo`, `/admin`, `/demo`)

Aprobada sobre las variantes B3/B4. Sustituye al patrón de tarjetas redondeadas en rejilla («bento»), que queda **prohibido** como estructura de página.

- **Placa, no tarjetas.** Cada vista o sección es una sola placa: borde de 1 px `--line`, radio 3 px y **marcas de corte** en las cuatro esquinas. Dentro, las zonas se separan con filetes de 1 px (horizontales o una columna vertical), nunca con cajas redondeadas anidadas. En la landing, las placas reemplazan a las tarjetas a sangre; el papel (`--paper`) sigue para los bloques narrativos.
- **Atmósfera de fondo.** Retícula de puntos de 22 px (`--hair2`) más un haz de brasa suave en una esquina (`--ember-soft`), siempre lejos del texto principal.
- **El dibujo es el dato.** Cada vista tiene una escala o diagrama dibujado en SVG desde los datos reales, no ilustración genérica. Ejemplos: red de anillos (rondas de aviso), pentagrama temporal (canales × tiempo), boletos (cupos), nota pegada en papel (avisos y estados especiales), hilo punteado con pulso (flujo de oferta). Nodos con ícono dibujado de canal; pulso de brasa solo en lo que está en curso.
- **Íconos propios.** Trazo de 1.5 px, 16 px, mismo estilo (chat = WhatsApp, avión = Telegram, sobre = Correo); nunca logos de marca ni emoji.
- **Movimiento** solo en lo vivo: pulso, flujo punteado, arco que se consume. Con `prefers-reduced-motion`, todo queda en su estado final.

### 1.2 Mostrar, no contar (regla obligatoria)

Se entiende mirando, no leyendo. Un párrafo explicativo es señal de que falta un dibujo.
1. **Franja de estado visual** arriba de cada vista operativa, sin frases. Usa piezas reconocibles:
   - **Puestos:** círculos (lleno = cubierto con la inicial; punteado con pulso = falta).
   - **Pasos o rondas:** stepper de íconos unidos por una línea, con el paso actual relleno en brasa.
   - **Tiempo:** reloj de arco que se consume, con la cifra en el centro.
   - **Cantidades:** barras o nodos, no números sueltos.
2. **Presupuesto de texto:** etiquetas de 1 a 3 palabras; títulos de 2 a 5. Nada de párrafos dentro de placas. Las explicaciones van en `title`/tooltip, en estados vacíos o en ayuda contextual que se abre a pedido.
3. **Leyenda corta** (punto/forma + 1–2 palabras) para cada código. El estado se codifica con forma + color (relleno, aro, punteado, ✓/✕ dibujados), nunca solo color. El detalle textual existe para lectores de pantalla (`aria-label`, `<title>`, tabla).
4. **En el dibujo, solo nombres;** el estado lo dan la forma y el color del nodo.
5. **Íconos antes que palabras** para canales, rondas y acciones repetidas (siempre con `aria-label`).
6. **Vocabulario del gerente, no del sistema** (cuando haga falta texto): «ronda de aviso» (no «oleada»), «puesto» (no «cupo»), «no le llegó» (no «rebotó»), «lo vio» (no «leído»), «se reintentó por Telegram» (no «escaló»), «Sin conexión en vivo» (no «SSE»). Ids técnicos solo en `/admin/auditoria` o detrás de un detalle. Los contratos de datos no cambian; solo cambia el texto que se muestra.
7. **En móvil:** la franja se apila y el dibujo se simplifica (solo nombres, o una fila por canal con puntos de estado).
8. **En la landing** aplica igual: cada sección explica con una escena dibujada y animada (no con párrafos), con un titular corto y como máximo una línea de apoyo.

## 2. Color — 60 / 30 / 10 (la paleta del código es la fuente de verdad)

Fuente única: `src/styles/theme.css`. **No se introducen colores nuevos.** Los componentes usan los alias `--color-*`; ningún otro archivo escribe un hex.

| Peso | Rol | Token | Valor |
|---|---|---|---|
| 60 % | Fondo de página y bandas oscuras | `--ink` | `#171719` |
| 30 % | Superficie elevada / tarjeta / tabla | `--graphite` · `--graphite-2` | `#1e1d20` · `#27262a` |
| 30 % | Filete 1 px | `--line` | `#35333a` |
| 30 % | Superficie de lectura (solo bloques narrativos de la landing) | `--paper` · `--paper-2` · `--paper-line` | `#ebe4d4` · `#ddd4bf` · `#c7bda4` |
| 30 % | Texto | `--text` · `--text-muted` | `#ebe7e0` · `#a8a5ab` (7:1 sobre tinta, 6:1 sobre grafito) |
| 30 % | Texto sobre papel | `--on-paper` · `--on-paper-muted` | `#16120e` · `#50483d` |
| 10 % | Acento (brasa) | `--ember` · `--ember-deep` | `#ff6a3d` · `#d8461a` (texto encima: `--on-ember #160a05`) |
| Estados | Solo alertas, siempre con texto | `--ok` · `--error` | `#4ade80` · `#ff5d5d` |

Reglas:
- La brasa es escasa: acción primaria (un solo primario por pantalla), dato vivo, logo, foco y alertas. Si ocupa más de ~10 % de una vista, sobra.
- Derivados solo con `color-mix` sobre tokens (`--hair`, `--hair-strong`, `--ember-soft`, `--dot`, `--nav-bg`).
- Papel solo en la landing; los paneles son tinta + grafito.
- Prohibidos `#000`/`#fff` de diseño y degradados de texto. Un solo tema (oscuro).
- Si un estado nuevo (p. ej. advertencia) necesita color, se pide aprobación y se agrega a `theme.css`; no se improvisa.

## 3. Tipografía

| Uso | Token | Familia |
|---|---|---|
| Títulos, UI, cuerpo | `--font-sans` | `Schibsted Grotesk` (alternativa: `Switzer`) |
| Datos, ids, tiempos, nodos, códigos | `--font-mono` | `IBM Plex Mono` 400/500, `font-variant-numeric: tabular-nums` |

- Dos familias, nada más. Autohospedadas (`@fontsource-variable/schibsted-grotesk`, `@fontsource/ibm-plex-mono`) para quitar a Google Fonts del camino del LCP.
- Escala: 12 · 14 · 16 (base, 1.5) · 20 · 28 · 40 · 64 (hero, 1.0, tracking −0.03em). Tracking negativo solo en ≥ 28 px.
- H1 del hero: peso 600, `--text`, sobre superficie plana (sin haces de luz detrás); contraste ≥ 15:1.
- Todo número que cambie en vivo (cupos, contadores, dinero, oleadas) va en mono tabular para que no baile.
- Celulares siempre enmascarados (`+57 3** *** 12 34`), según §9 del documento de diseño.

## 4. Layout

- **Contenedor maestro único:** `--container: 1200px`, `--gutter: clamp(16px, 4vw, 32px)`. Cabecera, hero, secciones, footer y paneles arrancan en el mismo borde. Se eliminan `--frame` y `--rail-in-frame`: las tarjetas a sangre se alinean al mismo borde.
- Retícula de 12 columnas, gap 24. Espacio base 4 px: 4·8·12·16·24·32·48·64·96.
- Radios: 6 (controles) · 10 (tarjetas) · 999 (solo puntos de estado). Se conservan los radios actuales de la landing (hasta 36); en paneles, 6–16.
- Un breakpoint estructural a 960 px; `/yo` se diseña desde 375 px.
- Paneles: barra lateral 240 px + contenido; tablas densas (fila 44 px); sin tarjetas idénticas repetidas como único recurso.

## 5. Componentes

- **Hero:** el dibujo (panel + teléfono) se conserva y se anima como hoy, pero en dos zonas separadas: el teléfono se coloca fuera del área de filas y píldoras del panel (sin solaparlas), y los haces de brasa no pasan detrás del H1 ni del lede (scrim local para contraste). Los cupos vacíos pasan a mostrar "0/2" con nodos, no cajas huecas.

- **Botón (sistema único):** alto 44 (sm 36 solo en tablas), radio 6, `600 15px`. Variantes: `primary` (brasa), `secondary` (grafito + filete), `ghost`, `danger` (`--error`). Relieve: borde superior 1 px más claro; hover sube un paso de fondo; `:active` desplaza 1 px. `:focus-visible` = 2 px `--color-focus`, offset 2. Deshabilitado 50 %, `aria-disabled`.
- **Solo `.btn` es clicable.** Notas informativas (p. ej. Paso 02): texto con filete izquierdo de 2 px, sin relleno ni forma de botón.
- **Badge:** punto + texto, mono 12 px, mayúsculas permitidas solo aquí.
- **Tabla de trazas** (Resend / WorkOS): cabecera fija, columnas mono alineadas a la derecha para tiempos, estado como badge, fila expandible, audit log inmutable (sin acciones de edición).
- **Timeline en vivo** (Trigger.dev): eje vertical, un nodo por evento (oferta enviada → entregada → leída → aceptada), hora mono, canal como etiqueta (WhatsApp / Telegram / Correo), línea punteada hasta el siguiente evento pendiente.
- **Desglose numérico** (Wise): conceptos con importes a la derecha en mono, total con filete superior; recalcula en vivo (`decimal.js`).
- **Consentimiento / OTP** (Documenso): paso a paso, 6 casillas de 44×56 mono, texto legal siempre visible.
- **Concurrencia** (Inngest): 50 nodos mono que colapsan a 3 confirmados; nodos, no personas; rótulo "Prueba de carga".
- **Estados:** `Loading` (esqueleto con la misma forma), `Empty` (qué falta + acción), `Error` (causa + reintentar), `SSE caído` (franja "En vivo interrumpido · actualizando cada 20 s").

## 6. Movimiento e ilustración

Se mantienen las animaciones actuales: ciclo del teléfono (12 s), pulsos de la red, haces, logo, flotado suave, entradas de scroll. Ajustes:
- Easing `--ease-out`; solo `transform`/`opacity`; entradas 0.2–0.35 s en UI, 0.7–1.2 s en escenas de la landing.
- **Lento solo donde es ambiente.** Filtros, tablas, navegación frecuente y todo lo operativo (paneles) responden en ≤ 200 ms, sin entrada decorativa. El hero conserva su entrada, pero sin retrasar el LCP.
- Un ciclo ambiental por zona; los paneles usan escenas estáticas o de ciclo lento (como el super admin hoy).
- `prefers-reduced-motion`: cada escena queda en su estado final con la información completa.
- Estilo de dibujo: formas planas, filete 1 px, un acento de brasa, rotación ligera (−3° a +8°). Sin 3D ni stock.

## 7. Accesibilidad

WCAG 2.2 AA: contraste ≥ 4.5:1 (texto) / 3:1 (UI), `:focus-visible` siempre, objetivos ≥ 44×44 en `/yo`, estado nunca solo por color, `lang="es-CO"`, decorativos `aria-hidden`.

## 8. Contenido y pendientes (no inventar)

`src/landing/config/site.js` (en este repo vive ahí, no en `src/config/`): `contact.email`, `contact.whatsapp`, `links.legalPortal`, `links.formEndpoint` siguen en `null` hasta tener el dato real. Sin cifras, clientes, testimonios ni precios. El Tablero de Impacto muestra solo mediciones reales de ensayos, o "sin datos aún". Hoja de ruta: "En este piloto" vs "Próximamente" (portal de vacantes, subida de documentos, ranking, pagos).

## 9. Datos y mocks

`VITE_USE_MOCKS=true` conmuta `src/services/*` entre API real y fixtures. Los hooks de TanStack Query consumen solo servicios. El mock emite eventos SSE simulados, permite forzar `loading | empty | error | sse-down` (fallback polling 15–30 s) y no escribe en consola. Contratos de datos y rutas actuales no cambian.

## 10. Mapa de rutas (se conserva)

`/`, `/contacto`, `/legal` · `/login`, `/terminos` · `/turnos`, `/turnos/nuevo`, `/turnos/:id`, `/banca`, `/reportes`, `/equipo`, `/ajustes` (+ `/alertas`, `/disputas` existentes) · `/admin/{orgs,roles,legal,terminos,auditoria,datos}` · `/yo` · `/demo` (por crear, rotulado "Simulación · Plan B").

## 11. Prohibiciones

Rejilla de tarjetas redondeadas iguales («bento») como estructura · tarjetas anidadas · dibujo sin frase de estado ni leyenda · jerga técnica visible al gerente · Eyebrows decorativos · texto con degradado · glassmorphism · sombras con halo · más de un primario por vista · colores fuera de `theme.css` · hex fuera de `theme.css` · animar layout · datos inventados · scroll horizontal.
