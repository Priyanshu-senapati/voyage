import type { Api } from './api/client'
import type { AuditEvent, Me } from './types'
import { useLoad } from './useLoad'

const ACTIONS: Record<string, string> = {
  'plan.created': 'Created a plan',
  'line.approved': 'Approved a line',
  'line.rejected': 'Rejected a line',
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    timeZone: 'Asia/Kolkata',
  })
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// "plan:3/line:41" -> "Plan #3, line 41"
function target(raw: string): string {
  const parts = Object.fromEntries(raw.split('/').map((part) => part.split(':')))
  if (parts.plan && parts.line) return `Plan #${parts.plan}, line ${parts.line}`
  if (parts.plan) return `Plan #${parts.plan}`
  return raw
}

export function AuditPage({ api, me }: { api: Api | null; me: Me | null }) {
  const admin = api !== null && me?.role === 'admin'
  const log = useLoad<AuditEvent[]>(admin ? 'audit' : 'none', () => (admin ? api.audit() : null))

  return (
    <section className="page" aria-labelledby="audit-title">
      <header className="page-head">
        <h1 id="audit-title">Audit log</h1>
        <p>Who created which plan and who decided each line, newest first. Nothing here can be edited.</p>
      </header>
      {!admin ? (
        <div className="state-panel">
          <h2>Admins only</h2>
          <p>
            {api
              ? `You're signed in as ${capital(me?.name ?? 'someone')} (${me?.role ?? 'unknown role'}). Ask an admin, or sign in as one.`
              : 'The demo has no audit log. Sign in with an admin key (Meera, in the hosted demo) to read it.'}
          </p>
        </div>
      ) : log.status === 'loading' ? (
        <p className="state-panel">Loading the audit log…</p>
      ) : log.status === 'error' ? (
        <p className="state-panel">{log.message}</p>
      ) : log.data.length === 0 ? (
        <div className="state-panel">
          <h2>Nothing yet</h2>
          <p>Saved plans and decisions will appear here.</p>
        </div>
      ) : (
        <div className="table-wrap page-table">
          <table className="table" aria-label="Audit log">
            <thead>
              <tr>
                <th scope="col">When (IST)</th>
                <th scope="col">Who</th>
                <th scope="col">What</th>
                <th scope="col">On</th>
              </tr>
            </thead>
            <tbody>
              {log.data.map((event) => (
                <tr key={event.id} className="row row-static">
                  <td>{when(event.at)}</td>
                  <td>
                    <strong>{capital(event.actor)}</strong>
                  </td>
                  <td>{ACTIONS[event.action] ?? event.action}</td>
                  <td>{target(event.target)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
