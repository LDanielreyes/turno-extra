import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../shared/api'
import { Btn, Card, Field, FormError, PageTitle } from '../shared/ui'
import { useOrg } from './org'

const thisMonth = () => new Date().toISOString().slice(0, 7)

// Reporte mensual por persona (CSV). Se pide con la sesión y se descarga como archivo.
export default function Reportes() {
  const { orgId } = useOrg()
  const [mes, setMes] = useState(thisMonth())
  const dl = useMutation({
    mutationFn: async () => {
      const res = await api(`/orgs/${orgId}/reports/monthly?mes=${mes}`, { raw: true })
      const url = URL.createObjectURL(await res.blob())
      const a = Object.assign(document.createElement('a'), { href: url, download: `turnoextra-${mes}.csv` })
      document.body.append(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
  })
  return (
    <>
      <PageTitle title="Reportes" lede="Por persona y mes: días, turnos, horas, horas nocturnas y dominicales, inasistencias y disputas." />
      <Card title="Reporte mensual (CSV)">
        <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); dl.mutate() }}>
          <Field label="Mes" type="month" required max={thisMonth()} value={mes} onChange={(e) => setMes(e.target.value)} />
          <Btn type="submit" variant="primary" loading={dl.isPending}>Descargar CSV</Btn>
        </form>
        <FormError error={dl.error} />
        <p className="small muted" style={{ marginTop: 16 }}>Los celulares salen enmascarados. Cada descarga queda en la bitácora.</p>
      </Card>
    </>
  )
}
