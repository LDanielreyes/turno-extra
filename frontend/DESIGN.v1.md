# DESIGN.md — TurnoExtra

Documento vivo y **vinculante**: todo cambio de interfaz en este proyecto lo sigue. Si una decisión nueva lo contradice, se actualiza este archivo en el mismo cambio, no después.

Stack: React 19 · Vite · react-router 7 · CSS plano (sin Tailwind ni librería de UI).

---

## 1. Concepto

**"Turno de noche."** Una cocina que sigue encendida cuando todo lo demás se apagó. Fondo de tinta negra (frío con un velo cálido, punto medio acordado), papel hueso como superficie de lectura y una sola brasa de acento.

El producto: el negocio publica un turno en el panel y la oferta llega por WhatsApp al personal que ya conoce; el primero que acepta ocupa el cupo. El diseño lo dice con dibujos de red (personas conectadas, la oferta viajando de nodo en nodo), no con fotos de stock.

Referencias de origen: raycast.com (precisión, oscuridad), daylightcomputer.com (calma, papel), craft.do/es (ilustración 2D amable). Son punto de partida, no plantilla: no se copian layouts.

Modo de la superficie: **Persuade** (sitio de marketing), con un formulario de contacto (**Operate**) en vistas interiores.

---

## 2. Color — regla 60 / 30 / 10

Fuente única: [src/styles/theme.css](src/styles/theme.css). **Ningún otro archivo escribe un hex.** Los componentes usan los alias `--color-*`.

| Peso | Rol | Token | Valor |
|---|---|---|---|
| 60 % | Dominante: fondo de página y bandas oscuras | `--ink` | `#171719` |
| 30 % | Superficie elevada | `--graphite` / `--graphite-2` | `#1e1d20` / `#27262a` |
| 30 % | Superficie de lectura | `--paper` / `--paper-2` | `#ebe4d4` / `#ddd4bf` |
| 30 % | Filetes | `--line`, `--paper-line` | `#35333a`, `#c7bda4` |
| 10 % | Acento | `--ember` / `--ember-deep` | `#ff6a3d` / `#d8461a` |

Texto: `--text #ebe7e0`, `--text-muted #a8a5ab` (opaco; nunca translúcido: 7:1 sobre tinta); sobre papel `--on-paper #16120e`, `--on-paper-muted #50483d`; sobre brasa `--on-ember #160a05`. Estados (solo alertas): `--ok #4ade80`, `--error #ff5d5d`.

Reglas:
- La brasa es **escasa**: acciones primarias, el dato vivo, el logo, un punto en las notas. Si aparece en más del ~10 % de una vista, sobra.
- Mezclas con `color-mix(in srgb, …)` sobre tokens (`--hair`, `--hair-strong`, `--ember-soft`, `--ember-glow`, `--nav-bg`). No se inventan transparencias con hex.
- Negro puro `#000` y blanco puro `#fff` prohibidos como colores de diseño (la sombra `--shadow-deep` es la única excepción).
- Contraste mínimo WCAG AA. `--text-muted` solo sobre `--ink`/`--graphite`; sobre papel usar `--on-paper-muted`.
- Un solo tema (oscuro, `color-scheme: dark`). No hay modo claro.

---

## 3. Tipografía

Variables en `theme.css`:

| Uso | Token | Familia |
|---|---|---|
| Títulos, números grandes, marca | `--font-display` | Bricolage Grotesque (variable, opsz 12–96, 400–800) |
| Cuerpo, UI, botones | `--font-body` | Hanken Grotesk (400–700) |
| Solo datos y teclas | `--font-mono` | JetBrains Mono (400, 500) |

- Base: `17px / 1.55`, `-webkit-font-smoothing: antialiased`.
- Título del hero: `clamp(46px, 6.6vw, 98px)`, peso 700, `line-height: 0.94`, `letter-spacing: -0.045em`, `text-wrap: balance`.
- Títulos de vistas interiores: `clamp(36px, 4.6vw, 64px)`, ancho máx. ~13ch.
- Lede/subtítulos: `clamp(18px, 1.6vw, 22px)`, `line-height: 1.3`, `max-width` en `ch` (27–34ch), `text-wrap: pretty`.
- Display siempre con tracking negativo (`-0.03em` a `-0.045em`); cuerpo sin tracking forzado.
- Datos numéricos: `.mono` (tabular-nums).
- **Prohibido:** eyebrows (etiquetas pequeñas en mayúsculas sobre el título), texto con degradado, más de tres familias, cursivas decorativas.
- Carga: hoy desde Google Fonts vía `index.html` (`display=swap`). **Pendiente de decisión:** autohospedar (`@fontsource-*`) para que el LCP del hero deje de depender del cambio de fuente (medido: 3.1 s con Google Fonts, 1.7 s sin). Si cambia, se actualiza esta sección y el comentario de `theme.css`.

---

## 4. Espacio, forma y movimiento

Fuente: [src/styles/tokens.css](src/styles/tokens.css).

- Espacio: `--space-1…8` = 4 · 8 · 16 · 24 · 40 · 64 · 104 · 152 px. Nada fuera de esa escala salvo `clamp()` fluidos justificados.
- Contenedor: `--container: 1240px`, `--gutter: clamp(20px, 4vw, 48px)`.
- **Carril único:** todo el contenido (cabecera, hero, problema, pasos, funciones, confianza, cierre, footer) arranca en el borde de `.container`. Las tarjetas a sangre (hero, cierre, bloque de papel) compensan su margen exterior con `--frame` y `--rail-in-frame` (tokens.css). No se inventan anchos de caja nuevos para alinear texto.
- Radios: `--radius-sm 10` · `md 16` · `lg 24` · `xl 36`. Botones 12 (sm 10, lg 14). Tarjeta del hero `clamp(20px, 2.4vw, 32px)`.
- Profundidad: `--lift` (borde superior luminoso + sombra desplazada y difuminada), `--lift-accent` para el botón primario. Sombras siempre con desplazamiento; nunca halo a cero.
- Filetes de 1 px (`--hair`, `--hair-strong`). Nada de bordes gruesos de color, salvo el contorno de brasa de la tarjeta destacada del hero.
- Easing: `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)` para todo lo que entra; `--ease-drop: cubic-bezier(0.7, 0, 0.3, 1)` para caídas. Sin rebote ni elástico.
- Duraciones: micro 0.2–0.35 s, entradas 0.7–1.2 s, ciclos ambientales 5–12 s.
- Solo se animan `transform`, `opacity`, `translate`, `scale`. Nunca propiedades de layout.
- Scroll: animaciones con `animation-timeline` (scroll/view) siempre con `@supports` y fallback estático.
- **Movimiento reducido:** `prefers-reduced-motion` desactiva animaciones y transiciones globalmente (ya en `global.css`). Cualquier animación nueva debe sobrevivir a esa regla sin perder información.
- Entrada de texto del hero: solo movimiento (`hero-rise`), sin partir de `opacity: 0`, para no retrasar el LCP.

---

## 5. Atmósfera y fondos

Es la firma visual del sitio. Cada capa tiene una función; no se agregan más sin quitar otra.

1. **Atmósfera fija** (`Atmosphere`): brasa en dos orbes, un haz de luz y la red de 13 nodos / 16 arcos con pulsos que viajan (SMIL, pausados con la pestaña oculta). Viva con el scroll (`useSmoothScroll`).
2. **Secciones oscuras transparentes:** dejan ver la atmósfera. El papel la tapa y trae su propio dibujo de puntos (`--paper-dot`).
3. **Ola de brasa** (`ember-wave`): un único elemento para cierre + footer, un único ciclo.
4. **Grano de película:** `body::after`, opacidad 0.035, fijo, sobre todo el sitio.
5. **Retícula de puntos** (`--dot`) en pizarras y miniaturas.

Reglas: la saturación de fondo se mantiene baja (se redujo a petición del usuario; no volver a subirla). No más de un ciclo ambiental visible por zona. Cada animación decorativa debe poder desaparecer sin que se pierda contenido.

---

## 6. Ilustración y logo

- Dibujos **2D hechos con CSS/SVG**: ventana de panel (`.win`), teléfono con chat de WhatsApp (`.phone`, ciclo de 12 s), burbujas (`.bub`), notas pegadas (`.note`), garabato de brasa bajo la palabra clave del hero.
- Estilo: formas planas, filete de 1 px, un acento de brasa por dibujo, ligera rotación (−3° a +8°) para que se sientan pegados a mano. Sin 3D, sin degradados de moda, sin ilustración de stock ni emoji como icono.
- Dibujos flotantes de fondo: en el hero (`.hero__stage`, parallax suave) y en las vistas interiores (`.phead__art`, `PageArt.css`). En móvil (≤ 960 px) pasan a flujo normal debajo del texto y pierden el parallax.
- Notas flotantes (`.note`): solo en las vistas interiores. El hero ya no las muestra: nada se pone encima del dibujo del producto.
- Logo (`Logo.css`): animado, con la brasa como único color. Mantener legible a 24 px y sin animación bajo `prefers-reduced-motion`.
- Iconos de características: set propio (`FeatureIcons`), trazo uniforme, un solo color.

---

## 7. Componentes

**Botón** (`styles/button.css`): alto 46 px (sm 38, lg 56), `font: 600 15px/1`, radio 12.
- `--primary`: fondo brasa, texto `--on-ember`, `--lift-accent`. **Un solo primario por pantalla visible.**
- Por defecto: grafito con filete; `--ghost`: transparente; `--ink`: para fondos de papel.
- Hover: sube 2 px y el borde se aclara; active: baja 1 px. La flecha `.btn__arrow` avanza 3 px.
- Deshabilitado: opacidad 0.55, cursor `progress`.
- **Solo `.btn` es clicable.** Lo informativo (p. ej. la nota del paso 2) usa borde punteado, sin relleno oscuro ni sombra. Ninguna otra forma de botón (nada de píldoras en mayúsculas en el footer).

**Cabecera:** se oculta al bajar y reaparece al subir; fondo `--nav-bg` (tinta al 72 %). Solo el contorno desenfocado necesario para legibilidad; el vidrio no es decoración.

**Hero:** tarjeta redondeada de tinta con filete, `min-height: max(660px, 100svh − 24px)`; se asienta (`card-settle`) y el texto se atenúa (`text-away`) al hacer scroll. Dos tarjetas inferiores: "peek" (borde brasa) y "pedido" (papel).

**Cabeceras de vista** (`PageHead`): título, lede y dibujo flotante opcional (`phead--art`).

**Formularios** (`form.css`): campos sobre grafito, cursor y foco en brasa; errores con `--color-danger` y texto, nunca solo color. Los endpoints reales están pendientes (ver §10).

**Progreso de scroll:** barra de 2 px en brasa arriba; se oculta si el navegador no soporta `scroll()`.

---

## 8. Layout y responsive

- Un solo punto de quiebre estructural: **960 px**. Por debajo: hero sin altura mínima, columnas apiladas, notas y "peek" ocultos, tarjeta de pedido a ancho completo, dibujos en flujo.
- Mobile-first en lo esencial: nada depende de `hover`; objetivos táctiles ≥ 44 px.
- Sin scroll horizontal (`overflow-x: clip` en `body`).
- Secciones respiran con `--space-7` / `--space-8`; dentro de bloques, `--space-3…5`.
- Lectura: líneas de 55–70 caracteres, `max-width` en `ch`.

---

## 9. Accesibilidad y rendimiento (no negociables)

- Foco visible: `outline: 2px solid var(--color-focus)` con `offset 3px`.
- `lang="es-CO"`; todo el copy en español de Colombia, tuteo.
- Los fondos y dibujos decorativos llevan `aria-hidden="true"`.
- Toda animación respeta `prefers-reduced-motion`.
- Rutas cargadas con `React.lazy`; chunks manuales en `vite.config.js`. No agregar dependencias pesadas sin medir.
- LCP del hero: el elemento es `p.hero__lede`; no depender de fuentes tardías ni de opacidad 0 al entrar.
- Presupuesto de referencia (Lighthouse móvil, build de producción, no `npm run dev`): LCP ≤ 2.5 s, CLS 0, TBT < 200 ms.
- Verificar siempre sobre `npm run build` + `vite preview`; las cifras de `npm run dev` no valen.

---

## 10. Contenido y pendientes (no inventar)

Valores `null` en [src/landing/config/site.js](src/landing/config/site.js) que **no se rellenan sin el dato real**: correo, WhatsApp, URL del panel, portal legal, endpoint del formulario. No inventar cifras, clientes, testimonios ni precios.

Pendiente de decisión: autohospedaje de fuentes (§3).

---

## 11. Prohibiciones (lista rápida)

- Eyebrows sobre títulos.
- Texto con degradado (`background-clip: text`).
- Glassmorphism decorativo.
- Tarjetas idénticas en cuadrícula repetida como único recurso de layout.
- Hex o nombres de fuente fuera de `theme.css`.
- Más de un botón primario visible; más de un acento de color.
- Animar propiedades de layout; rebotes; parpadeos.
- Subir la saturación de los fondos o añadir capas ambientales sin retirar otra.
- Placeholders con datos de contacto inventados.

---

## 12. Cómo cambiar el diseño

1. Color o fuente → solo `theme.css`.
2. Espacio, radio, easing → solo `tokens.css`.
3. Un componente nuevo usa tokens y alias existentes; si necesita uno nuevo, se añade al token file y se documenta aquí.
4. Antes de dar un cambio por bueno: ver el resultado renderizado a 1440 px y a 390 px, con y sin `prefers-reduced-motion`, y correr `npm run build`.
5. Cualquier cambio que toque §2–§6 actualiza este documento en el mismo commit.

## 13. Paneles (app autenticada)

Los paneles comparten tokens, botón y tipografía con la landing, pero son superficie **Operate**: sin atmósfera animada, una sola brasa de fondo fija y estática (`shell.css`, `acceso.css`), tablas y formularios densos. Marco común: `shared/Shell` (barra lateral; arriba y plegable en ≤ 960 px). Toda vista tiene estados cargando, vacío y error (`shared/ui`: `Async`, `Loading`, `Empty`, `ErrorState`). Estados con color **y** texto (`Badge`). Datos con TanStack Query; tiempo real por SSE (`useOrgStream`) con polling de respaldo a 20 s.

**Super admin** (`panel-admin/`): maximalista en el dibujo, preciso en el trabajo. Cada sección abre con un escenario (`Masthead` + `scenes.jsx`): título display grande, los datos clave en una línea (`facts`) y una escena 2D **armada con los datos reales** de la sección — ciudad de noche (un edificio por organización, ventanas = gerentes, sobre hacia las invitaciones pendientes), credenciales colgadas (roles y sus documentos), reloj de recargos de 24 h (tramo nocturno vigente, semana con dominical, valor de la hora calculado), hoja que se firma (el borrador en vivo, sello al publicar), sismógrafo (actividad de 24 h) y ficha que se anonimiza (fases del borrado). Prohibido dibujar datos inventados: sin datos, la escena muestra su versión punteada. Dentro de los paneles: icono de sección en la cabecera, glifos que repiten la escena (edificio por fila, glifo por acción), carta de invitación que entra al sobre, efecto del valor legal sobre la hora, vacíos dibujados. El trabajo sigue denso: tablas (`.ak-table`), controles de 40 px, estados con `Badge`, mono solo en ids y horas, un primario por pantalla. Movimiento: entrada única por escena y ciclos ambientales lentos; con movimiento reducido cada escena queda en su estado final.

## Mapa de archivos

Una carpeta por vista en `src/`:

| Carpeta | Qué contiene |
|---|---|
| `landing/` | Landing pública: `components/`, `pages/`, `content/`, `config/site.js`, `routes.jsx` (todo lo de §1–§10 vive aquí) |
| `acceso/` | `/login` (empresa y candidato), `/terminos`, `/aceptar-invitacion/:id` |
| `panel-empresa/` | `/turnos`, `/turnos/nuevo`, `/turnos/:id`, `/banca`, `/alertas`, `/disputas`, `/reportes`, `/equipo`, `/ajustes` |
| `panel-admin/` | `/admin/orgs`, `roles`, `legal`, `terminos`, `auditoria`, `datos` |
| `panel-candidato/` | `/yo` (contrato de backend pendiente, ver el comentario de `Yo.jsx`) |
| `shared/` | Cliente API, sesión, guardas por rol, `Shell`, kit de UI, formato, SSE |
| `styles/` | `theme.css` (color, fuente), `tokens.css`, `global.css`, `button.css` |

Los datos de la landing (tabla anterior): `src/landing/config/site.js`; atmósfera, hero y dibujos en `src/landing/components/`; vistas y formulario en `src/landing/pages/`. La API se configura con `VITE_API_URL` (ver `.env.example`).
