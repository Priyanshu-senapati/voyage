import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronRight, X } from 'lucide-react'
import type { useDesk } from './useDesk'
import { PLANNER_CANCEL, PLANNER_EVENT_GUESS, draftOf, whatIfActive } from './useDesk'
import type { Plan, PlanLine } from './types'
import { count, inr, percent, riskWord, sum, weekLabel } from './format'
import { Badge, Delta, InfoTip, Segmented } from './ui'
import { LineCase } from './LineCase'
import { RiskCurve } from './RiskCurve'
import { useMedia } from './useMedia'

type Desk = ReturnType<typeof useDesk>

const BUDGET = { min: 2e6, max: 5e7, step: 1e6 }

const signedPercent = (v: number) => (v === 0 ? 'As forecast' : `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`)
const lineKey = (l: { city: string; week: string; hotel: string }) => `${l.city}|${l.week}|${l.hotel}`
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
  })
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function PlanMode({ desk }: { desk: Desk }) {
  const [view, setView] = useState<'list' | 'curve'>('list')
  const [openId, setOpenId] = useState<number | null>(null)
  const plan = desk.planView
  const scenario = whatIfActive(desk.whatIf)
  const base = scenario ? desk.base : null
  const open = plan?.lines.find((l) => l.id === openId) ?? null
  const openBase = open && base ? (base.lines.find((l) => lineKey(l) === lineKey(open)) ?? null) : null

  return (
    <div className="plan-mode">
      <Settings desk={desk} />
      <section className="results" aria-label="Plan results" aria-busy={desk.previewing || undefined}>
        <ResultStatus desk={desk} plan={plan} scenario={scenario} />
        {plan ? <Kpis plan={plan} base={base} /> : <div className="kpis kpis-loading" aria-hidden="true" />}
        <div className="results-bar">
          <Segmented
            label="Results"
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: `Buy list${plan ? ` · ${plan.lines.length}` : ''}` },
              { value: 'curve', label: 'Risk curve' },
            ]}
          />
        </div>
        {view === 'list' ? (
          plan ? (
            <BuyTable plan={plan} base={base} onOpen={setOpenId} />
          ) : (
            <div className="panel empty">Working out the plan…</div>
          )
        ) : (
          <div className="panel">
            <RiskCurve
              api={desk.api}
              draft={desk.draft}
              risk={desk.draft.risk}
              whatIf={desk.whatIf}
              onPick={(risk) => desk.setDraft({ ...desk.draft, risk })}
            />
          </div>
        )}
      </section>
      {open && plan && (
        <Sheet title={`${open.city} · ${open.hotel}`} onClose={() => setOpenId(null)}>
          <LineCase line={open} unsaved={plan.id === null} base={scenario ? openBase : undefined} />
        </Sheet>
      )}
    </div>
  )
}

function Settings({ desk }: { desk: Desk }) {
  const { draft, whatIf, saved } = desk
  const active = whatIfActive(whatIf)
  const usable = desk.live && desk.state === 'ready'
  // side by side on wide screens; on narrow ones the settings fold to one line so the answer comes first
  const wide = useMedia('(min-width: 1261px)')
  const [open, setOpen] = useState(false)
  const expanded = wide || open
  const canSave = usable && !active && desk.preview !== null && !desk.previewing && !desk.creating

  let help: string
  if (!desk.live) help = "This demo can't re-plan. Sign in to try budgets and what-ifs."
  else if (desk.creating) help = 'Saving…'
  else if (desk.previewing) help = 'Re-planning…'
  else if (active) help = "What-ifs explore a different December. Saved plans use the planner's own forecast."
  else if (desk.preview) help = 'Saves this plan and sends every line for approval.'
  else if (saved) help = `This is plan #${saved.id}. Change the settings to plan again.`
  else help = ''

  return (
    <aside className="panel settings" aria-label="Plan settings">
      <div className="settings-top">
        <h2 className="panel-title">Plan settings</h2>
        {!wide && (
          <button type="button" className="link-button" aria-expanded={expanded} onClick={() => setOpen(!open)}>
            {expanded ? 'Hide' : 'Edit'}
          </button>
        )}
      </div>
      {!expanded && (
        <p className="settings-summary">
          {inr(draft.budget)} budget · {riskWord(draft.risk)} risk ({draft.risk})
          {(draft.cityCap !== null || draft.hotelCap !== null) && ' · caps on'}
          {active && ' · what-if on'}
        </p>
      )}
      {expanded && (
      <>
      <Slider
        label="Budget"
        output={inr(draft.budget)}
        min={BUDGET.min}
        max={BUDGET.max}
        step={BUDGET.step}
        value={draft.budget}
        disabled={!usable}
        ends={['₹20L', '₹5 cr']}
        onChange={(budget) => desk.setDraft({ ...draft, budget })}
      />
      <Slider
        label="Risk setting"
        info="Low chases the best average profit. High gives up a little of it to protect profit in bad seasons. The Risk curve tab shows the trade."
        output={`${riskWord(draft.risk)} · ${draft.risk}`}
        min={0}
        max={1}
        step={0.05}
        value={draft.risk}
        disabled={!usable}
        ends={['Chase profit', 'Protect bad seasons']}
        onChange={(risk) => desk.setDraft({ ...draft, risk })}
      />

      <div className="settings-section">
        <h2 className="panel-title">
          Exposure caps
          <InfoTip label="exposure caps">
            The most of the whole budget the plan may put in one city, or with one hotel. The optimizer keeps to them.
            The Exposure page shows each cap's headroom and what it costs.
          </InfoTip>
        </h2>
        <CapSelect
          label="Most in one city"
          value={draft.cityCap}
          options={CITY_CAPS}
          disabled={!usable}
          onChange={(cityCap) => desk.setDraft({ ...draft, cityCap })}
        />
        <CapSelect
          label="Most with one hotel"
          value={draft.hotelCap}
          options={HOTEL_CAPS}
          disabled={!usable}
          onChange={(hotelCap) => desk.setDraft({ ...draft, hotelCap })}
        />
        {(draft.cityCap !== null || draft.hotelCap !== null) && desk.planView && !desk.previewing && (
          <p className="fine">
            {desk.planView.caps_cost > 0
              ? `These caps give up about ${inr(desk.planView.caps_cost)} of risk-adjusted profit.`
              : "These caps don't hold the plan back at this budget."}
          </p>
        )}
      </div>

      <div className="settings-section">
        <div className="settings-head">
          <h2 className="panel-title">
            What if…
            <InfoTip label="what-ifs">
              Re-plans the same budget in a different December. Every headline number then shows its change against
              the plan without the what-if.
            </InfoTip>
          </h2>
        </div>
        <Slider
          label="Demand vs forecast"
          output={signedPercent(whatIf.demand)}
          min={-0.5}
          max={1}
          step={0.05}
          value={whatIf.demand}
          disabled={!usable}
          ends={['−50%', '+100%']}
          onChange={(demand) => desk.setWhatIf({ ...whatIf, demand })}
        />
        <Slider
          label="Supplier rates"
          output={signedPercent(whatIf.cost)}
          min={-0.3}
          max={0.5}
          step={0.05}
          value={whatIf.cost}
          disabled={!usable}
          ends={['−30%', '+50%']}
          onChange={(cost) => desk.setWhatIf({ ...whatIf, cost })}
        />
        <Slider
          label="Event weeks"
          info="How much busier festival, match and concert weeks get. Left alone, the planner assumes 1.5× normal demand."
          output={whatIf.event === null ? 'Planner’s guess' : `${whatIf.event.toFixed(1)}× demand`}
          min={1}
          max={3}
          step={0.1}
          value={whatIf.event ?? PLANNER_EVENT_GUESS}
          disabled={!usable}
          ends={['No boost', '3× demand']}
          onChange={(event) => desk.setWhatIf({ ...whatIf, event })}
        />
        <Slider
          label="Cancellations"
          info="Share of agent bookings that later cancel. Left alone, the planner uses 41%, measured on real bookings."
          output={whatIf.cancel === null ? 'Planner’s rate' : percent(whatIf.cancel)}
          min={0}
          max={0.8}
          step={0.01}
          value={whatIf.cancel ?? PLANNER_CANCEL}
          disabled={!usable}
          ends={['None', '80%']}
          onChange={(cancel) => desk.setWhatIf({ ...whatIf, cancel })}
        />
      </div>
      </>
      )}

      <div className="settings-foot">
        <button type="button" className="btn btn-primary btn-block" disabled={!canSave} onClick={desk.savePlan}>
          Save plan
        </button>
        {active && usable && (
          <button type="button" className="btn btn-ghost btn-block" onClick={desk.resetWhatIf}>
            Reset what-ifs
          </button>
        )}
        {saved && desk.changed && usable && (
          <button type="button" className="btn btn-ghost btn-block" onClick={desk.resetChanges}>
            Back to plan #{saved.id}
          </button>
        )}
        {help && (
          <p className="fine" role="status">
            {help}
          </p>
        )}
      </div>
    </aside>
  )
}

interface SliderProps {
  label: string
  info?: string
  output: string
  min: number
  max: number
  step: number
  value: number
  disabled: boolean
  ends: [string, string]
  onChange: (value: number) => void
}

// Shares of the whole budget; with 5 cities and 10 hotels an even split is 20% and 10%
const CITY_CAPS = [0.5, 0.4, 0.3, 0.25, 0.2]
const HOTEL_CAPS = [0.25, 0.2, 0.15, 0.12, 0.1]

interface CapSelectProps {
  label: string
  value: number | null
  options: number[]
  disabled: boolean
  onChange: (value: number | null) => void
}

function CapSelect({ label, value, options, disabled, onChange }: CapSelectProps) {
  const id = useId()
  return (
    <div className="field-row cap-field">
      <label htmlFor={id} className="field-name">
        {label}
      </label>
      <select
        id={id}
        className="select select-sm"
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      >
        <option value="">No cap</option>
        {options.map((share) => (
          <option key={share} value={share}>
            {Math.round(share * 100)}% of budget
          </option>
        ))}
      </select>
    </div>
  )
}

function Slider({ label, info, output, min, max, step, value, disabled, ends, onChange }: SliderProps) {
  const id = useId()
  return (
    <div className="field">
      <div className="field-row">
        <label htmlFor={id} className="field-name">
          {label}
        </label>
        {info && <InfoTip label={label}>{info}</InfoTip>}
        <output htmlFor={id} className="field-value">
          {output}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={output}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
      />
      <div className="field-ends" aria-hidden="true">
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
    </div>
  )
}

function ResultStatus({ desk, plan, scenario }: { desk: Desk; plan: Plan | null; scenario: boolean }) {
  let lead: ReactNode
  if (!plan) lead = <span className="muted">Working out what this budget buys…</span>
  else if (scenario) {
    lead = (
      <>
        <Badge tone="accent">What-if</Badge>
        <span>Changes are against the same budget and risk without the what-if.</span>
      </>
    )
  } else if (plan.id === null) {
    lead = (
      <>
        <Badge tone="warn">Not saved</Badge>
        <span>A preview of these settings. Save it to send it for approval.</span>
      </>
    )
  } else {
    const saved = desk.saved
    lead = (
      <span>
        <strong>Plan #{plan.id}</strong>
        {saved?.created_by && saved.created_at && (
          <span className="muted">
            {' '}
            · saved by {capital(saved.created_by)} on {when(saved.created_at)} · {draftOf(saved).risk} risk
          </span>
        )}
      </span>
    )
  }
  return (
    <div className="result-status">
      {lead}
      {desk.previewing && <span className="updating">Re-planning…</span>}
    </div>
  )
}

function Kpis({ plan, base }: { plan: Plan; base: Plan | null }) {
  const rooms = sum(plan.lines.map((l) => l.rooms))
  const baseRooms = base ? sum(base.lines.map((l) => l.rooms)) : 0
  return (
    <dl className="kpis panel">
      <div className="kpi">
        <dt>Spend</dt>
        <dd key={plan.spend} className="kpi-value kpi-tick">{inr(plan.spend)}</dd>
        <dd className="kpi-sub">
          of {inr(plan.budget_inr)} · {inr(plan.budget_inr - plan.spend)} kept back
        </dd>
        {base && (
          <dd className="kpi-delta">
            <Delta value={plan.spend - base.spend} format={inr} better="none" />
          </dd>
        )}
      </div>
      <div className="kpi">
        <dt>
          Expected profit
          <InfoTip label="expected profit">The average profit over 200 simulated Decembers.</InfoTip>
        </dt>
        <dd key={plan.expected_profit} className="kpi-value kpi-tick">{inr(plan.expected_profit)}</dd>
        <dd className="kpi-sub">in an average season</dd>
        {base && (
          <dd className="kpi-delta">
            <Delta value={plan.expected_profit - base.expected_profit} format={inr} />
          </dd>
        )}
      </div>
      <div className="kpi">
        <dt>
          Bad-season profit
          <InfoTip label="bad-season profit">
            The whole plan's average profit in its worst 5% of 200 simulated Decembers. Raising the risk setting
            protects this number.
          </InfoTip>
        </dt>
        <dd key={plan.worst_case_profit} className="kpi-value kpi-tick">{inr(plan.worst_case_profit)}</dd>
        <dd className="kpi-sub">worst 5% of seasons, whole plan</dd>
        {base && (
          <dd className="kpi-delta">
            <Delta value={plan.worst_case_profit - base.worst_case_profit} format={inr} />
          </dd>
        )}
      </div>
      <div className="kpi">
        <dt>Rooms</dt>
        <dd key={rooms} className="kpi-value kpi-tick">{count(rooms)}</dd>
        <dd className="kpi-sub">across {plan.lines.length} hotel-weeks</dd>
        {base && (
          <dd className="kpi-delta">
            <Delta value={rooms - baseRooms} format={count} better="none" />
          </dd>
        )}
      </div>
    </dl>
  )
}

function BuyTable({ plan, base, onOpen }: { plan: Plan; base: Plan | null; onOpen: (id: number) => void }) {
  const baseRooms = new Map(base?.lines.map((l) => [lineKey(l), l.rooms]))
  return (
    <div className="panel table-panel list-scroll">
      <table className={`table${base ? ' table-whatif' : ''}`} aria-label="Buy list">
        <thead>
          <tr>
            <th scope="col" className="num-col hide-md">#</th>
            <th scope="col">Hotel</th>
            <th scope="col" className="hide-sm">Week</th>
            <th scope="col" className="num">Rooms</th>
            <th scope="col" className="hide-md">Buy by</th>
            <th scope="col" className="num hide-md">
              Sell at
              <InfoTip label="recommended selling price">
                The price per room-night to list at: the base rate moved the way real agent rates move with demand.
                Busy weeks carry a higher rate; the buying cost and the profit figures are unchanged.
              </InfoTip>
            </th>
            <th scope="col" className="num">Expected profit</th>
            <th scope="col" className="num hide-sm">
              Bad-season profit
              <InfoTip label="a line's bad-season profit">
                Each line's own average in its worst 5% of seasons. A single line often loses money then; the whole
                plan rarely does, because hotels seldom have a bad season at the same time.
              </InfoTip>
            </th>
            <th scope="col" className="chevron-col">
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {plan.lines.map((line) => (
            <Row key={line.id} line={line} baseRooms={base ? (baseRooms.get(lineKey(line)) ?? 0) : null} onOpen={onOpen} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({ line, baseRooms, onOpen }: { line: PlanLine; baseRooms: number | null; onOpen: (id: number) => void }) {
  const change = baseRooms === null ? 0 : line.rooms - baseRooms
  return (
    <tr className="row-link" onClick={() => onOpen(line.id)}>
      <td className="num-col muted hide-md">{line.rank}</td>
      <td>
        <button type="button" className="row-button" onClick={() => onOpen(line.id)}>
          <strong>{line.city}</strong> <span className="muted">· {line.hotel}</span>
          <span className="show-sm muted">{weekLabel(line.week)}</span>
        </button>
      </td>
      <td className="hide-sm">
        {weekLabel(line.week)}
        {line.why.event_week && (
          <span className="event-tag" title="Festival, match or concert week">
            Event
          </span>
        )}
      </td>
      <td className="num">
        {line.rooms}
        {change !== 0 && (
          <span className={`row-delta ${change > 0 ? 'delta-good' : 'delta-bad'}`}>
            {change > 0 ? '+' : '−'}
            {Math.abs(change)}
          </span>
        )}
      </td>
      <td className="hide-md">{shortDate(line.buy_by)}</td>
      <td className="num hide-md">
        {line.why.selling_price != null ? (
          <>
            {inr(line.why.selling_price)}
            {line.why.price_change != null && Math.abs(line.why.price_change) >= 0.005 && (
              <span className={`row-delta ${line.why.price_change > 0 ? 'delta-good' : 'delta-bad'}`}>
                {line.why.price_change > 0 ? '+' : '−'}
                {Math.round(Math.abs(line.why.price_change) * 100)}%
              </span>
            )}
          </>
        ) : (
          <span className="muted">{inr(line.unit_price)}</span>
        )}
      </td>
      <td className="num strong">{inr(line.expected_profit)}</td>
      <td className="num hide-sm">{inr(line.worst_case_profit)}</td>
      <td className="chevron-col">
        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
      </td>
    </tr>
  )
}

// A side sheet on the native <dialog>: focus trap, Escape and the backdrop come with it
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      // Escape only; the dialog's own `close` event also fires on React's unmount cleanup, which would
      // re-trigger onClose and fight the parent's state (the sheet would never stay open under StrictMode)
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="sheet-body">
        <button type="button" className="icon-button sheet-close" aria-label="Close details" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
        {children}
      </div>
    </dialog>
  )
}
