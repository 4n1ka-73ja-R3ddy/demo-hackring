import { useState } from 'react'
import { tc } from '../../lib/format'
import { useStore } from '../../state/store'
import type { Decision, Segment, Version, Video } from '../../types'
import { DECISION_META, DecisionGlyph, cx } from '../ui'

type Filter = 'all' | 'kept' | 'cut' | 'review'

function signals(s: Segment) {
  const out: string[] = []
  if (s.repeats) out.push('Repeat')
  if (s.tags.includes('tangent')) out.push('Tangent')
  if (s.tags.includes('mistake')) out.push('Corrected later')
  if (s.corrects) out.push('Correction')
  if (s.tags.includes('question')) out.push('Question')
  if (s.tags.includes('answer')) out.push('Answer')
  if (s.lang.length > 1 || (s.lang.length === 1 && s.lang[0] !== 'en')) out.push(s.lang.join('+').toUpperCase())
  if (s.noise === 'high' || s.noise === 'medium') out.push('Noise')
  if (s.tags.includes('pause')) out.push('Pause')
  return out
}

export function SegmentList({ video, version, onAction, dimmed }: {
  video: Video
  version: Version
  onAction: (segmentId: string, action: 'keep' | 'remove' | 'protect' | 'clear') => void
  dimmed: boolean
}) {
  const { state, dispatch } = useStore()
  const [filter, setFilter] = useState<Filter>('all')
  const rows = video.segments.map((s) => ({ s, d: version.plan.decisions.find((x) => x.segmentId === s.id)! }))
  const count = (f: Filter) => rows.filter(({ d }) => match(f, d.decision)).length

  return (
    <div className={cx('transition-opacity', dimmed && 'opacity-40')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Edit decisions</h2>
        <div role="tablist" aria-label="Filter segments" className="flex rounded-lg border border-line bg-card p-0.5 text-[13px]">
          {(['all', 'kept', 'cut', 'review'] as Filter[]).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cx('tnum rounded-md px-2.5 py-1 font-medium', filter === f ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink')}
            >
              {{ all: 'All', kept: 'Kept', cut: 'Cut', review: 'Needs review' }[f]} {count(f)}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-3 divide-y divide-line-2 overflow-hidden rounded-xl border border-line bg-card">
        {rows.filter(({ d }) => match(filter, d.decision)).map(({ s, d }) => {
          const m = DECISION_META[d.decision]
          const selected = state.selectedSegmentId === s.id
          const cut = d.decision === 'remove'
          return (
            <li key={s.id} className={cx('group relative', selected && 'bg-paper/70')}>
              <span className={cx('absolute inset-y-0 left-0 w-1', cut ? 'hatch bg-cut-soft' : m.bar)} aria-hidden />
              <div className="grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-2 py-3 pl-4 pr-3 sm:grid-cols-[96px_1fr_auto]">
                <button onClick={() => dispatch({ type: 'select', id: s.id })} className="col-span-2 flex items-center gap-2 text-left sm:col-span-1 sm:block">
                  <span className={cx('flex items-center gap-1.5 text-[12px] font-semibold', m.text)}>
                    <DecisionGlyph d={d.decision} /> {m.label}
                  </span>
                  <span className="tnum block text-[12px] text-muted sm:mt-0.5">{tc(s.start)}–{tc(s.end)}</span>
                </button>
                <button onClick={() => dispatch({ type: 'select', id: s.id })} className="min-w-0 text-left">
                  <p className={cx('font-medium leading-snug', cut && 'text-muted')}>
                    {s.title}
                    {d.source === 'creator' && <span className="ml-2 rounded bg-line-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-2">Your change</span>}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{d.reason}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded bg-line-2 px-1.5 py-0.5 text-ink-2">Importance {d.importance.toLowerCase()}</span>
                    {!cut && (
                      <span className="tnum rounded bg-line-2 px-1.5 py-0.5 text-ink-2">
                        {d.trimmedToCore ? `${Math.round(d.keptSeconds)}s of ${s.end - s.start}s` : `${Math.round(d.keptSeconds)}s`}
                      </span>
                    )}
                    {d.rejectedCuts.length > 0 && <span className="rounded bg-guard-soft px-1.5 py-0.5 font-medium text-guard">Unsafe cut blocked</span>}
                    {signals(s).map((x) => <span key={x} className="rounded border border-line-2 px-1.5 py-0.5 text-muted">{x}</span>)}
                  </div>
                </button>
                <div className="flex items-center gap-1 self-center">
                  <RowButton label={`Why: ${s.title}`} onClick={() => dispatch({ type: 'select', id: s.id, panel: 'why' })}>Why</RowButton>
                  {cut ? (
                    <RowButton label={`Restore ${s.title}`} onClick={() => onAction(s.id, 'keep')}>Restore</RowButton>
                  ) : (
                    <RowButton label={`Cut ${s.title}`} onClick={() => onAction(s.id, 'remove')}>Cut</RowButton>
                  )}
                  {d.decision !== 'protected' && !cut && (
                    <RowButton label={`Protect ${s.title}`} onClick={() => onAction(s.id, 'protect')} className="hidden md:inline-flex">Protect</RowButton>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function match(f: Filter, d: Decision) {
  if (f === 'all') return true
  if (f === 'kept') return d === 'keep' || d === 'protected'
  if (f === 'cut') return d === 'remove'
  return d === 'risk'
}

function RowButton({ children, onClick, label, className }: { children: React.ReactNode; onClick: () => void; label: string; className?: string }) {
  return (
    <button onClick={onClick} aria-label={label} className={cx('inline-flex h-7 items-center rounded-md border border-line px-2 text-[12px] font-medium text-ink-2 hover:border-ink-2/50 hover:text-ink', className)}>
      {children}
    </button>
  )
}
