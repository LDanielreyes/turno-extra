import { useMemo, useState } from 'react'

// Kit de tablas: ordenar por columna, buscar, filtrar y paginar. Todo en el cliente, sobre las filas ya cargadas.
// Cada vista conserva su propio marcado (.tbl o .ak-table); aquí solo vive la lógica y las piezas de control.
//
//   const t = useTable(rows, {
//     sorters: { nombre: (r) => r.nombre, alta: { by: (r) => +new Date(r.createdAt), first: 'desc' } },
//     initialSort: { key: 'alta', dir: 'desc' },
//     search: (r) => r.nombre,
//     filters: { estado: (r, v) => r.estado === v },
//   })
//   <TableTools t={t} filters={[{ key: 'estado', label: 'Estado', options: [['activo', 'Activos']] }]} />
//   <SortTh t={t} k="nombre">Nombre</SortTh>   …   t.view.map(...)   …   <Pager t={t} />

export const PAGE_SIZES = [10, 25, 50]

const cmp = (x, y) => (typeof x === 'string' || typeof y === 'string'
  ? String(x).localeCompare(String(y), 'es', { numeric: true, sensitivity: 'base' })
  : x - y)

export function useTable(rows, { sorters = {}, initialSort = null, search, filters = {}, pageSize = 10 } = {}) {
  const [sort, setSortRaw] = useState(initialSort)
  const [query, setQueryRaw] = useState('')
  const [values, setValues] = useState({})
  const [page, setPage] = useState(1)
  const [size, setSizeRaw] = useState(pageSize)

  const filtered = useMemo(() => {
    const k = query.trim().toLowerCase()
    return rows.filter((r) => (!k || !search || search(r).toLowerCase().includes(k))
      && Object.entries(values).every(([key, v]) => !v || !filters[key] || filters[key](r, v)))
    // `search` y `filters` son funciones estables por vista: se leen al filtrar, no cambian el resultado entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, values])

  const sorted = useMemo(() => {
    const spec = sort && sorters[sort.key]
    if (!spec) return filtered
    const by = typeof spec === 'function' ? spec : spec.by
    const m = sort.dir === 'asc' ? 1 : -1
    // Los vacíos van siempre al final, sin importar la dirección.
    return [...filtered].sort((a, b) => {
      const x = by(a), y = by(b)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      return cmp(x, y) * m
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort])

  const pages = Math.max(1, Math.ceil(sorted.length / size))
  const current = Math.min(page, pages)
  const view = sorted.slice((current - 1) * size, current * size)
  const active = Boolean(query.trim()) || Object.values(values).some(Boolean)

  return {
    view, total: sorted.length, all: rows.length, sort, query, values, size, pages, page: current, active,
    from: sorted.length ? (current - 1) * size + 1 : 0,
    to: Math.min(current * size, sorted.length),
    setPage,
    setQuery: (q) => { setQueryRaw(q); setPage(1) },
    setFilter: (key, v) => { setValues((o) => ({ ...o, [key]: v })); setPage(1) },
    setSize: (n) => { setSizeRaw(n); setPage(1) },
    reset: () => { setQueryRaw(''); setValues({}); setPage(1) },
    toggleSort: (key) => {
      const spec = sorters[key]
      const first = (spec && typeof spec === 'object' && spec.first) || 'asc'
      setSortRaw((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: first }))
      setPage(1)
    },
  }
}

const Chev = ({ up, on }) => (
  <svg viewBox="0 0 8 5" width="8" height="5" aria-hidden="true" className={`tt-chev${on ? ' is-on' : ''}`}>
    <path d={up ? 'M1 4.2 4 1l3 3.2' : 'M1 .8 4 4l3-3.2'} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Encabezado ordenable: botón accesible con aria-sort en el <th>. */
export function SortTh({ t, k, children, className }) {
  const on = t.sort?.key === k
  return (
    <th className={className} aria-sort={on ? (t.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`tt-sort${on ? ' is-on' : ''}`} onClick={() => t.toggleSort(k)}>
        {children}
        <span className="tt-arrows"><Chev up on={on && t.sort.dir === 'asc'} /><Chev on={on && t.sort.dir === 'desc'} /></span>
      </button>
    </th>
  )
}

/** Búsqueda + filtros + contador. `filters`: [{ key, label, options: [[valor, etiqueta]] }]. */
export function TableTools({ t, placeholder = 'Buscar', filters = [], extra }) {
  return (
    <div className="tt-bar" role="search">
      {t.all > 0 && (
        <label className="tt-search">
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <span className="sr-only">{placeholder}</span>
          <input type="search" placeholder={placeholder} value={t.query} onChange={(e) => t.setQuery(e.target.value)} />
        </label>
      )}
      {filters.map((f) => (
        <select key={f.key} className="tt-select" aria-label={f.label} value={t.values[f.key] ?? ''} onChange={(e) => t.setFilter(f.key, e.target.value)}>
          <option value="">{f.label}</option>
          {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ))}
      {extra}
      {t.active && <button type="button" className="tt-clear" onClick={t.reset}>Limpiar filtros</button>}
      <span className="tt-count" aria-live="polite">{t.active ? `${t.total} de ${t.all}` : t.all} {t.all === 1 ? 'resultado' : 'resultados'}</span>
    </div>
  )
}

/** Páginas visibles: primera, última y una ventana alrededor de la actual, con «…». */
function windowOf(page, pages) {
  const set = new Set([1, pages, page - 1, page, page + 1])
  const out = []
  for (let n = 1; n <= pages; n++) {
    if (set.has(n)) out.push(n)
    else if (out.at(-1) !== '…') out.push('…')
  }
  return out
}

/** Pie de la tabla: rango visible, filas por página y navegación. Se oculta si todo cabe en una página mínima. */
export function Pager({ t }) {
  if (t.total === 0) return null
  const single = t.pages === 1 && t.total <= PAGE_SIZES[0]
  return (
    <nav className="tt-pager" aria-label="Paginación">
      <span className="tt-range mono">{single ? `${t.total} ${t.total === 1 ? 'fila' : 'filas'}` : `${t.from}–${t.to} de ${t.total}`}</span>
      {!single && (
        <>
          <label className="tt-size">
            <span>Filas</span>
            <select className="tt-select" value={t.size} onChange={(e) => t.setSize(+e.target.value)}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {t.pages > 1 && (
            <div className="tt-pages">
              <button type="button" className="tt-pg" disabled={t.page === 1} onClick={() => t.setPage(t.page - 1)} aria-label="Página anterior">‹</button>
              {windowOf(t.page, t.pages).map((n, i) => n === '…'
                ? <span key={`g${i}`} className="tt-gap" aria-hidden="true">…</span>
                : <button key={n} type="button" className={`tt-pg${n === t.page ? ' is-on' : ''}`} aria-current={n === t.page ? 'page' : undefined} aria-label={`Página ${n}`} onClick={() => t.setPage(n)}>{n}</button>)}
              <button type="button" className="tt-pg" disabled={t.page === t.pages} onClick={() => t.setPage(t.page + 1)} aria-label="Página siguiente">›</button>
            </div>
          )}
        </>
      )}
    </nav>
  )
}

/** Sin resultados con filtros activos. */
export function NoMatch({ t }) {
  return (
    <div className="tt-none">
      <p>Nada coincide con estos filtros.</p>
      <button type="button" className="tt-clear" onClick={t.reset}>Limpiar filtros</button>
    </div>
  )
}
