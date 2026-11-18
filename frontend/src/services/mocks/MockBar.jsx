import { PERSONAS, SCENARIOS, getPersona, getScenario, setPersona, setScenario } from './scenario'

const LABEL = { live: 'En vivo', empty: 'Vacío', cero: '0 elegibles', error: 'Error', slow: 'Lento', 'sse-down': 'Sin tiempo real' }
const PERSONA_LABEL = { gerente: 'Gerente', admin: 'Super admin', candidato: 'Candidato' }

// Rótulo fijo de simulación + selector de persona y de escenario. Solo existe con VITE_USE_MOCKS=true.
export default function MockBar() {
  const current = getScenario()
  return (
    <div className="mockbar" role="region" aria-label="Simulación">
      <span className="mockbar__dot" aria-hidden="true" />
      <span>Simulación</span>
      <select aria-label="Persona de la simulación" value={getPersona()} onChange={(e) => setPersona(e.target.value)}>
        {PERSONAS.map((p) => <option key={p} value={p}>{PERSONA_LABEL[p]}</option>)}
      </select>
      <select aria-label="Escenario de la simulación" value={current} onChange={(e) => setScenario(e.target.value)}>
        {SCENARIOS.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
      </select>
    </div>
  )
}
