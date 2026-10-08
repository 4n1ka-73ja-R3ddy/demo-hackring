import { useEffect, useState } from 'react'
import { spokenText } from '../../lib/edit'
import { tc } from '../../lib/format'
import { useStore } from '../../state/store'
import type { GuardIssue, Segment, Version, Video } from '../../types'
import { Button, DecisionBadge, cx } from '../ui'
import { WordDiff } from './WordDiff'

type Act = (segmentId: string, action: 'keep' | 'remove' | 'protect' | 'clear') => void

export function SidePanel({ video, version, onAction, onAsk }: { video: Video; version: Version; onAction: Act; onAsk: (q: string) => void }) {
  const { state, dispatch } = useStore()
  const review = version.plan.issues.filter((i) => i.resolution === 'needs-review').length
  const tabs = [
    { id: 'agent' as const, label: 'Agent run' },
    { id: 'guard' as const, label: `ContextGuard${version.plan.issues.length ? ` ${version.plan.issues.length}` : ''}` },
    { id: 'why' as const, label: 'Why' },
  ]
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div role="tablist" className="flex gap-1 border-b border-line px-3 pt-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={state.sidePanel === t.id}
            onClick={() => dispatch({ type: 'panel', panel: t.id })}
            className={cx(
              'tnum relative -mb-px border-b-2 px-2.5 py-2 text-[13px] font-medium',
              state.sidePanel === t.id ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
            {t.id === 'guard' && review > 0 && <span className="ml-1 inline-block size-1.5 -translate-y-1.5 rounded-full bg-risk" aria-label={`${review} need review`} />}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {state.sidePanel === 'agent' && <AgentLog version={version} />}
        {state.sidePanel === 'guard' && <GuardPanel video={video} version={version} onAction={onAction} />}
        {state.sidePanel === 'why' && <Inspector video={video} version={version} onAction={onAction} onAsk={onAsk} />}
      </div>
    </div>
  )
}

function AgentLog({ version }: { version: Version }) {
  const { state, dispatch } = useStore()
  const running = state.runningVersionId === version.id
  const steps = version.plan.steps
  const [shown, setShown] = useState(running ? 0 : steps.length)

  useEffect(() => {
    if (!running) { setShown(steps.length); return }
    setShown(0)
    let n = 0
    const iv = setInterval(() => {
      n++
      setShown(n)
      if (n >= steps.length) { clearInterval(iv); dispatch({ type: 'run-done' }) }
    }, 230)
    return () => clearInterval(iv)
  }, [running, version.id, steps.length, dispatch])

  return (
    <div>
      <p className="text-[13px] text-muted">Goal</p>
      <p className="font-serif text-[17px] italic leading-snug">"{version.instruction}"</p>
      <ol className="mt-4 space-y-3">
        {steps.slice(0, shown).map((s) => (
          <li key={s.id} className="step-in grid grid-cols-[20px_1fr] gap-2.5">
            <span
              className={cx(
                'mt-0.5 grid size-5 place-items-center rounded-full text-[11px] font-bold',
                s.status === 'done' && 'bg-keep-soft text-keep',
                s.status === 'warn' && 'bg-risk-soft text-risk',
                s.status === 'retry' && 'bg-guard-soft text-guard',
              )}
              aria-label={s.status === 'done' ? 'Done' : s.status === 'warn' ? 'Warning' : 'Fixed'}
            >
              {s.status === 'done' ? '✓' : s.status === 'warn' ? '!' : '↻'}
            </span>
            <div>
              <p className="text-[14px] font-medium leading-snug">{s.label}</p>
              <p className="text-[13px] leading-snug text-muted">{s.detail}</p>
            </div>
          </li>
        ))}
        {shown < steps.length && (
          <li className="flex items-center gap-2.5 text-[13px] text-muted">
            <i className="pulse-dot ml-1.5 size-2 rounded-full bg-ink" /> Working…
          </li>
        )}
      </ol>
    </div>
  )
}

const KIND_LABEL: Record<GuardIssue['kind'], string> = {
  'meaning-change': 'Meaning change',
  'missing-context': 'Missing context',
  'orphaned-answer': 'Answer without its question',
  'removed-correction': 'Correction removed',
  contradiction: 'Contradiction',
}

function GuardPanel({ video, version, onAction }: { video: Video; version: Version; onAction: Act }) {
  const { dispatch } = useStore()
  const issues = version.plan.issues
  const seg = (id: string) => video.segments.find((s) => s.id === id)!
  if (!issues.length)
    return (
      <div>
        <p className="font-semibold">No meaning changes found.</p>
        <p className="mt-1 text-[14px] text-muted">Every cut in this version was compared with the original context: negations, conditions, questions and answers, and corrections all survive.</p>
      </div>
    )
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">
        Before anything is cut, ContextGuard compares what viewers will hear with what was said. {issues.filter((i) => i.resolution === 'auto-fixed').length} fixed automatically, {issues.filter((i) => i.resolution === 'needs-review').length} need your decision.
      </p>
      {issues.map((i) => (
        <article key={i.id} className={cx('rounded-xl border p-3.5', i.resolution === 'needs-review' ? 'border-risk/40 bg-risk-soft/40' : 'border-line')}>
          <div className="flex items-center justify-between gap-2">
            <span className={cx('text-[12px] font-semibold', i.resolution === 'needs-review' ? 'text-risk' : 'text-guard')}>{KIND_LABEL[i.kind]}</span>
            <span className={cx('rounded px-1.5 py-0.5 text-[11px] font-semibold', i.resolution === 'needs-review' ? 'bg-risk text-white' : 'bg-guard-soft text-guard')}>
              {i.resolution === 'needs-review' ? 'Needs review' : i.kind === 'meaning-change' ? 'Cut rejected' : 'Fixed'}
            </span>
          </div>
          <p className="mt-1.5 text-[14px] font-medium leading-snug">{i.title}</p>
          {i.kind === 'meaning-change' && i.before && i.after ? (
            <div className="mt-3 space-y-2 text-[15px]">
              <div>
                <p className="text-[11px] font-medium text-muted">As spoken</p>
                <p className="font-serif leading-snug"><WordDiff before={i.before} after={i.after} mode="before" /></p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-risk">If the cut went through</p>
                <p className="font-serif leading-snug text-risk line-through decoration-risk/40">{i.after}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-keep">What viewers will hear</p>
                <p className="font-serif leading-snug">{i.resolutionNote.match(/"(.+)"/)?.[1] ?? i.before}</p>
              </div>
              <p className="text-[13px] text-muted">{i.detail}</p>
            </div>
          ) : (
            <>
              <p className="mt-1 text-[13px] text-muted">{i.detail}</p>
              {i.relatedId && (
                <div className="mt-2.5 space-y-1.5 border-l-2 border-line pl-3 font-serif text-[14px] leading-snug">
                  <p><span className="tnum mr-1.5 font-sans text-[12px] text-muted">{tc(seg(i.relatedId).start)}</span>{seg(i.relatedId).core?.text ?? seg(i.relatedId).text}</p>
                  <p><span className="tnum mr-1.5 font-sans text-[12px] text-muted">{tc(seg(i.segmentId).start)}</span>{seg(i.segmentId).core?.text ?? seg(i.segmentId).text}</p>
                </div>
              )}
              {i.resolution === 'auto-fixed' && <p className="mt-2 text-[13px] font-medium text-guard">{i.resolutionNote}</p>}
            </>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {i.resolution === 'needs-review' && i.relatedId && (
              <>
                <Button size="sm" variant="primary" onClick={() => onAction(i.relatedId!, 'keep')}>Restore {seg(i.relatedId).title.split(':')[0].toLowerCase()}</Button>
                <Button size="sm" onClick={() => onAction(i.segmentId, 'remove')}>Cut this too</Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'select', id: i.segmentId, panel: 'why' })}>Show segment</Button>
          </div>
        </article>
      ))}
    </div>
  )
}

function Inspector({ video, version, onAction, onAsk }: { video: Video; version: Version; onAction: Act; onAsk: (q: string) => void }) {
  const { state, dispatch } = useStore()
  const s = video.segments.find((x) => x.id === state.selectedSegmentId)
  if (!s)
    return <p className="text-[14px] text-muted">Select a segment on the timeline or in the list to see what was decided and why.</p>
  const d = version.plan.decisions.find((x) => x.segmentId === s.id)!
  const speaker = video.speakers.find((x) => x.id === s.speaker)
  const rel = relations(video, s)
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <DecisionBadge d={d.decision} />
        <span className="tnum text-[12px] text-muted">{tc(s.start)}–{tc(s.end)}</span>
      </div>
      <h3 className="mt-2 text-[18px] font-semibold leading-snug">{s.title}</h3>
      {speaker && <p className="text-[13px] text-muted">{speaker.name}, {speaker.role.toLowerCase()}{s.lang.length ? `, speaking ${s.lang.join(' and ').toUpperCase()}` : ''}</p>}
      {s.keyframeUrl && <img src={s.keyframeUrl} alt="" className="mt-3 aspect-video w-full rounded-lg bg-line-2 object-cover" />}

      <div className="mt-4 rounded-lg bg-paper p-3">
        <p className="text-[12px] font-medium text-muted">Reason</p>
        <p className="mt-0.5 text-[14px] leading-snug">{d.reason}</p>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
        <div><dt className="text-muted">Importance</dt><dd className="font-semibold">{d.importance}</dd></div>
        <div><dt className="text-muted">Context risk</dt><dd className={cx('font-semibold', d.contextRisk === 'High' && 'text-risk')}>{d.contextRisk}</dd></div>
        <div><dt className="text-muted">In this version</dt><dd className="tnum font-semibold">{d.decision === 'remove' ? 'Cut' : `${Math.round(d.keptSeconds)}s of ${s.end - s.start}s`}</dd></div>
      </dl>

      {s.text && (
        <div className="mt-4">
          <p className="text-[12px] font-medium text-muted">{d.decision === 'remove' ? 'What was said' : 'What viewers hear'}</p>
          <p className="mt-1 font-serif text-[17px] leading-snug">{d.decision === 'remove' ? s.text : spokenText(s, d)}</p>
        </div>
      )}

      {s.innerCuts && d.decision !== 'remove' && (
        <div className="mt-4 space-y-2">
          <p className="text-[12px] font-medium text-muted">Cuts inside this segment</p>
          {s.innerCuts.map((c) => {
            const rejected = d.rejectedCuts.includes(c.id)
            return (
              <div key={c.id} className={cx('rounded-lg border p-2.5 text-[13px]', rejected ? 'border-guard/40 bg-guard-soft/40' : 'border-line')}>
                <p className="font-medium">{c.label}: {rejected ? <span className="text-guard">rejected by ContextGuard</span> : <span className="text-keep">applied, saves {c.saves}s</span>}</p>
                <p className="mt-1 font-serif text-[14px] leading-snug"><WordDiff before={c.before} after={c.after} mode="before" /></p>
              </div>
            )
          })}
        </div>
      )}

      {rel.length > 0 && (
        <div className="mt-4">
          <p className="text-[12px] font-medium text-muted">Linked context</p>
          <ul className="mt-1 space-y-1">
            {rel.map(({ label, seg }) => (
              <li key={label + seg.id}>
                <button onClick={() => dispatch({ type: 'select', id: seg.id })} className="text-left text-[13px] hover:underline">
                  <span className="text-muted">{label}</span> {seg.title} <span className="tnum text-muted">{tc(seg.start)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-line-2 pt-4">
        {d.decision === 'remove' ? (
          <Button size="sm" variant="primary" onClick={() => onAction(s.id, 'keep')}>Restore</Button>
        ) : (
          <Button size="sm" onClick={() => onAction(s.id, 'remove')}>Cut</Button>
        )}
        {d.decision !== 'protected' && <Button size="sm" onClick={() => onAction(s.id, 'protect')}>Protect</Button>}
        {version.overrides[s.id] && <Button size="sm" variant="ghost" onClick={() => onAction(s.id, 'clear')}>Use agent's decision</Button>}
        <Button size="sm" variant="ghost" onClick={() => onAsk(`Why did you ${d.decision === 'remove' ? 'cut' : 'keep'} "${s.title}"?`)}>Ask in chat</Button>
      </div>
    </div>
  )
}

function relations(video: Video, s: Segment) {
  const out: { label: string; seg: Segment }[] = []
  const get = (id: string) => video.segments.find((x) => x.id === id)!
  for (const d of s.dependsOn ?? []) out.push({ label: s.tags.includes('answer') ? 'Answers' : 'Needs', seg: get(d) })
  for (const x of video.segments) if (x.dependsOn?.includes(s.id)) out.push({ label: x.tags.includes('answer') ? 'Answered by' : 'Needed by', seg: x })
  if (s.corrects) out.push({ label: 'Corrects', seg: get(s.corrects) })
  for (const x of video.segments) if (x.corrects === s.id) out.push({ label: 'Corrected by', seg: x })
  if (s.repeats) out.push({ label: 'Repeats', seg: get(s.repeats) })
  for (const x of video.segments) if (x.repeats === s.id) out.push({ label: 'Repeated by', seg: x })
  return out
}
