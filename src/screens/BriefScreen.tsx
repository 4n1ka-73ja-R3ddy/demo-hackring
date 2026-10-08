import { useEffect, useMemo, useRef, useState } from 'react'
import { AUDIENCES, CATEGORIES, DURATIONS, PURPOSES, REQUIREMENTS } from '../data/categories'
import { applyInstruction, parseInstruction } from '../engine/instructions'
import { human, uid } from '../lib/format'
import { createVersion } from '../services/agent'
import { exampleInstruction } from '../lib/fromAnalysis'
import { useStore } from '../state/store'
import { Button, Card, Choice, MicIcon, cx } from '../components/ui'
import type { AudienceId, Brief, CategoryId, PurposeId } from '../types'

interface Preset { label: string; audience: AudienceId; purpose: PurposeId; seconds: number }

function presetsFor(category: CategoryId): Preset[] {
  if (category === 'sports' || category === 'gaming')
    return [
      { label: 'Extended highlights', audience: 'general', purpose: 'highlights', seconds: 300 },
      { label: 'Followers recap', audience: 'followers', purpose: 'summary', seconds: 180 },
      { label: '60-second short', audience: 'general', purpose: 'short', seconds: 60 },
    ]
  if (['travel', 'vlog', 'food', 'entertainment'].includes(category))
    return [
      { label: 'Full vlog', audience: 'followers', purpose: 'full', seconds: 600 },
      { label: '3-minute summary', audience: 'general', purpose: 'summary', seconds: 180 },
      { label: '60-second reel', audience: 'followers', purpose: 'short', seconds: 60 },
    ]
  return [
    { label: 'Beginner lesson', audience: 'beginner', purpose: 'full', seconds: 600 },
    { label: 'Student revision', audience: 'student', purpose: 'revision', seconds: 300 },
    { label: '60-second short', audience: 'general', purpose: 'short', seconds: 60 },
  ]
}

const defaultBrief = (category: CategoryId): Brief => ({
  category,
  audience: 'general',
  purpose: 'summary',
  targetSeconds: 300,
  requirements: ['remove-repetition', 'remove-pauses'],
  lockedTopics: [],
  instruction: '',
})

export function BriefScreen() {
  const { state, dispatch } = useStore()
  const video = state.video!
  const brief = state.briefDraft ?? defaultBrief(state.category!)
  const set = (b: Partial<Brief>) => dispatch({ type: 'set-brief', brief: { ...brief, ...b } })
  const [listening, setListening] = useState(false)
  const typing = useRef<number | null>(null)
  const [customDur, setCustomDur] = useState(!DURATIONS.some((d) => d.seconds === brief.targetSeconds))

  useEffect(() => () => { if (typing.current) clearInterval(typing.current) }, [])

  const parsed = useMemo(() => parseInstruction(brief.instruction, video), [brief.instruction, video])

  const onInstruction = (text: string) => {
    const p = parseInstruction(text, video)
    // Text adds to the brief; it never silently removes something set by hand.
    const next = applyInstruction({ ...brief, lockedTopics: brief.lockedTopics }, p, text)
    if (p.patch.targetSeconds) setCustomDur(!DURATIONS.some((d) => d.seconds === p.patch.targetSeconds))
    dispatch({ type: 'set-brief', brief: next })
  }

  const listen = () => {
    if (listening) return
    setListening(true)
    const full = exampleInstruction(brief.category)
    setTimeout(() => {
      let i = 0
      typing.current = window.setInterval(() => {
        i += 2
        onInstructionRef.current(full.slice(0, i))
        if (i >= full.length) {
          clearInterval(typing.current!)
          typing.current = null
          setListening(false)
        }
      }, 28)
    }, 700)
  }
  const onInstructionRef = useRef(onInstruction)
  onInstructionRef.current = onInstruction

  const plan = () => {
    const b = { ...brief, instruction: brief.instruction || 'Edit set with the controls' }
    const v = createVersion(video, b, null)
    dispatch({
      type: 'add-versions',
      versions: [v],
      chat: [
        { id: uid('m'), role: 'creator', text: b.instruction },
        { id: uid('m'), role: 'agent', text: `Planned "${v.name}": ${human(v.plan.outputSeconds)} from ${human(video.duration)}. ${v.plan.issues.length ? `ContextGuard caught ${v.plan.issues.length} problem${v.plan.issues.length === 1 ? '' : 's'} before anything was cut.` : 'ContextGuard found no problems.'}`, versionId: v.id },
      ],
    })
  }

  const presets = presetsFor(brief.category)
  const planAll = () => {
    const vs = presets.map((p) => createVersion(video, { ...brief, audience: p.audience, purpose: p.purpose, targetSeconds: p.seconds, instruction: `${p.label}, ${human(p.seconds)}` }, null))
    dispatch({
      type: 'add-versions',
      versions: vs,
      chat: [
        { id: uid('m'), role: 'creator', text: `Make three versions: ${presets.map((p) => p.label.toLowerCase()).join(', ')}.` },
        { id: uid('m'), role: 'agent', text: 'Three versions from the same footage. Each audience got a different selection, not the same edit at three lengths:', bullets: vs.map((v) => `${v.name}: ${v.plan.decisions.filter((d) => d.decision !== 'remove').length} segments, ${human(v.plan.outputSeconds)}`) },
      ],
    })
  }

  return (
    <div className="mx-auto max-w-[980px] px-4 pb-24 pt-8 sm:px-6">
      <h1 className="text-[28px] font-bold tracking-tight">What should this become?</h1>
      <p className="mt-1 text-[15px] text-ink-2">Say it in your own words. The settings below fill in as you type, and you can adjust them after.</p>

      <Card className="mt-6 p-2">
        <div className="relative">
          <label htmlFor="instruction" className="sr-only">Describe the edit you want</label>
          <textarea
            id="instruction"
            rows={3}
            value={brief.instruction}
            onChange={(e) => onInstruction(e.target.value)}
            placeholder={exampleInstruction(brief.category)}
            className="w-full resize-none rounded-lg bg-transparent px-3 py-3 pr-14 text-[19px] leading-snug outline-none placeholder:text-muted/70"
          />
          <button
            onClick={listen}
            aria-label={listening ? 'Listening' : 'Speak your instruction'}
            className={cx('absolute right-2 top-2 grid size-10 place-items-center rounded-full transition-colors', listening ? 'bg-risk text-white' : 'bg-line-2 text-ink hover:bg-line')}
          >
            {listening ? <i className="pulse-dot size-2.5 rounded-full bg-white" /> : <MicIcon />}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line-2 px-3 py-2.5">
          {brief.instruction ? (
            parsed.understood.length ? (
              <>
                <span className="text-[13px] text-muted">Understood:</span>
                {parsed.understood.map((u) => (
                  <span key={u} className="step-in rounded-md bg-keep-soft px-2 py-0.5 text-[13px] font-medium text-keep">{u}</span>
                ))}
              </>
            ) : (
              <span className="text-[13px] text-muted">Mention a length, an audience or a format, for example "5 minutes for students".</span>
            )
          ) : (
            <button className="text-[13px] font-medium text-guard hover:underline" onClick={() => onInstruction(exampleInstruction(brief.category))}>
              Use: "{exampleInstruction(brief.category)}"
            </button>
          )}
          {listening && <span className="ml-auto text-[13px] text-risk">Listening…</span>}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Field label="Category" hint="Detected from the footage. Changing it changes what counts as important.">
          <select
            value={brief.category}
            onChange={(e) => { dispatch({ type: 'set-category', category: e.target.value as CategoryId }); set({ category: e.target.value as CategoryId }) }}
            className="h-10 w-full rounded-lg border border-line bg-card px-3 text-[14px]"
          >
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}{c.id === video.detectedCategory ? ' (detected)' : ''}</option>)}
          </select>
        </Field>
        <Field label="Target length">
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <Choice key={d.seconds} selected={!customDur && brief.targetSeconds === d.seconds} onClick={() => { setCustomDur(false); set({ targetSeconds: d.seconds }) }}>{d.label}</Choice>
            ))}
            <Choice selected={customDur} onClick={() => setCustomDur(true)}>Custom</Choice>
            {customDur && (
              <label className="flex items-center gap-2 text-[13px]">
                <input type="number" min={10} max={video.duration} value={brief.targetSeconds} onChange={(e) => set({ targetSeconds: Math.max(10, Number(e.target.value) || 10) })} className="tnum h-9 w-20 rounded-lg border border-line bg-card px-2" />
                seconds
              </label>
            )}
          </div>
        </Field>
        <Field label="Audience" hint={AUDIENCES.find((a) => a.id === brief.audience)?.hint}>
          <div className="flex flex-wrap gap-2">
            {AUDIENCES.map((a) => <Choice key={a.id} selected={brief.audience === a.id} onClick={() => set({ audience: a.id })}>{a.label}</Choice>)}
          </div>
          {brief.audience === 'custom' && (
            <input value={brief.customAudience ?? ''} onChange={(e) => set({ customAudience: e.target.value })} placeholder="e.g. Hiring managers who don't code" className="mt-2 h-10 w-full rounded-lg border border-line bg-card px-3 text-[14px]" />
          )}
        </Field>
        <Field label="Purpose" hint={PURPOSES.find((p) => p.id === brief.purpose)?.hint}>
          <div className="flex flex-wrap gap-2">
            {PURPOSES.map((p) => <Choice key={p.id} selected={brief.purpose === p.id} onClick={() => set({ purpose: p.id })}>{p.label}</Choice>)}
          </div>
        </Field>
        <Field label="Special requirements">
          <div className="flex flex-wrap gap-2">
            {REQUIREMENTS.map((r) => {
              const on = brief.requirements.includes(r.id)
              return <Choice key={r.id} selected={on} onClick={() => set({ requirements: on ? brief.requirements.filter((x) => x !== r.id) : [...brief.requirements, r.id] })}>{r.label}</Choice>
            })}
          </div>
        </Field>
        {video.topics.length > 0 && <Field label="Must keep" hint="Topics the agent may trim but never cut.">
          <div className="flex flex-wrap gap-2">
            {video.topics.map((t) => {
              const on = brief.lockedTopics.includes(t.id)
              return <Choice key={t.id} selected={on} onClick={() => set({ lockedTopics: on ? brief.lockedTopics.filter((x) => x !== t.id) : [...brief.lockedTopics, t.id] })}>{t.name}</Choice>
            })}
          </div>
        </Field>}
      </div>

      <div className="mt-10 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center">
        <Button variant="primary" onClick={plan} className="h-11 px-5 text-[15px]">Plan this edit</Button>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          <span>or make three at once:</span>
          <button onClick={planAll} className="font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
            {presets.map((p) => `${p.label} (${human(p.seconds)})`).join(', ')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[14px] font-semibold">{label}</p>
      {hint && <p className="mb-2 text-[13px] text-muted">{hint}</p>}
      <div className={hint ? '' : 'mt-2'}>{children}</div>
    </div>
  )
}
