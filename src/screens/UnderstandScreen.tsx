import { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORIES, categoryById } from '../data/categories'
import { scoreAll } from '../engine/planner'
import { videoFromAnalysis } from '../lib/fromAnalysis'
import { tc } from '../lib/format'
import { confirmCategory, getJob } from '../services/api'
import { useStore } from '../state/store'
import { Button, Card, Choice, cx } from '../components/ui'
import type { AnalysisResult, CategoryId } from '../types'

const STAGES = ['Reading video', 'Extracting frames', 'Loading model', 'Classifying frames', 'Analysing scenes']

export function UnderstandScreen() {
  const { state, dispatch } = useStore()
  const { upload, job } = state

  // Poll the backend while the job runs.
  const failures = useRef(0)
  const [pollError, setPollError] = useState<string | null>(null)
  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'error' || pollError) return
    const t = setTimeout(() => {
      getJob(job.video_id)
        .then((j) => { failures.current = 0; setPollError(null); dispatch({ type: 'job', job: j }) })
        .catch((e: Error) => {
          failures.current++
          if (failures.current >= 5) setPollError(`Lost contact with the analysis server: ${e.message}`)
          dispatch({ type: 'job', job: { ...job } }) // re-arm the poll
        })
    }, 600)
    return () => clearTimeout(t)
  }, [job, dispatch, pollError])

  const restart = () => dispatch({ type: 'reset' })

  if (upload?.error || job?.status === 'error' || pollError) {
    return (
      <Shell>
        <Card className="border-risk/40 p-6">
          <p className="text-[13px] font-semibold text-risk">{upload?.error ? 'Upload rejected' : 'Analysis failed'}</p>
          <h1 className="mt-1 text-[22px] font-bold">{upload?.fileName ?? job?.file_name}</h1>
          <p className="mt-2 max-w-[70ch] text-[15px] text-ink-2">{upload?.error ?? job?.error ?? pollError}</p>
          <Button variant="primary" className="mt-5" onClick={restart}>Choose another file</Button>
        </Card>
      </Shell>
    )
  }

  if (!job || job.status !== 'done' || !job.result) {
    const uploading = !job
    const pct = uploading ? (upload?.progress ?? 0) : job.progress
    const current = uploading ? -1 : STAGES.indexOf(job.stage)
    return (
      <Shell>
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card className="overflow-hidden">
            {state.videoUrl && <video src={state.videoUrl} className="aspect-video w-full bg-ink" controls muted />}
          </Card>
          <Card className="h-fit p-5">
            <h1 className="text-[15px] font-semibold">{uploading ? 'Uploading' : 'Analysing your video'}</h1>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line-2" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${Math.max(3, pct * 100)}%` }} />
            </div>
            <p className="tnum mt-1.5 text-[13px] text-muted">{Math.round(pct * 100)}%{!uploading && job.status === 'queued' ? ', waiting for the previous job' : ''}</p>
            <ol className="mt-4 space-y-2.5">
              <Step label="Upload and validate the file" state={uploading ? 'active' : 'done'} />
              {STAGES.map((s, i) => (
                <Step key={s} label={s} state={uploading || i > current ? 'todo' : i === current ? 'active' : 'done'} />
              ))}
            </ol>
            <p className="mt-4 text-[12px] leading-relaxed text-muted">
              Frames are sampled across the whole video and compared with descriptions of each category by a CLIP model running on the analysis server. The first run downloads the model.
            </p>
          </Card>
        </div>
      </Shell>
    )
  }

  return <Result result={job.result} />
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1180px] px-4 pb-24 pt-8 sm:px-6">{children}</div>
}

function Step({ label, state }: { label: string; state: 'done' | 'active' | 'todo' }) {
  return (
    <li className="flex items-center gap-3 text-[14px]">
      <span className={cx('grid size-5 shrink-0 place-items-center rounded-full text-[11px]', state === 'done' ? 'bg-keep text-white' : state === 'active' ? 'border-2 border-ink' : 'border border-line')} aria-hidden>
        {state === 'done' ? '✓' : state === 'active' ? <i className="pulse-dot size-1.5 rounded-full bg-ink" /> : null}
      </span>
      <span className={state === 'todo' ? 'text-muted' : 'text-ink'}>{label}</span>
    </li>
  )
}

function Result({ result: r }: { result: AnalysisResult }) {
  const { state, dispatch } = useStore()
  const job = state.job!
  const confirmed = job.confirmed_category && state.video ? job.confirmed_category : null
  const [choosing, setChoosing] = useState(false)
  const [pick, setPick] = useState<CategoryId>(confirmed ?? r.predicted_category)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const confirm = (category: CategoryId, source: 'ai' | 'manual') => {
    setSaving(true)
    setErr(null)
    confirmCategory(r.video_id, category, source)
      .then((j) => {
        dispatch({ type: 'job', job: j })
        dispatch({ type: 'confirm-category', category, video: videoFromAnalysis(r, state.videoUrl) })
        setChoosing(false)
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setSaving(false))
  }

  const m = r.metadata
  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">{m.file_name}</h1>
          <p className="tnum mt-1 text-[14px] text-muted">
            {tc(m.duration)}, {m.width}×{m.height}, {m.fps} fps. {m.frames_analyzed} frames and {r.scenes.length} scenes analysed.
          </p>
        </div>
        {confirmed && (
          <Button variant="primary" onClick={() => { dispatch({ type: 'set-video', video: { ...state.video!, intent: state.intent } }); dispatch({ type: 'go', stage: 'brief' }) }}>
            Continue to brief
          </Button>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* Suggestion and confirmation */}
        <Card className="p-5 sm:p-6">
          <dl>
            <dt className="text-[13px] text-muted">AI suggested category</dt>
            <dd className="text-[30px] font-bold leading-tight tracking-tight">{r.predicted_label}</dd>
            <dt className="mt-2 text-[13px] text-muted">Confidence</dt>
            <dd className="flex items-center gap-3">
              <span className="tnum text-[20px] font-semibold">{Math.round(r.confidence * 100)}%</span>
              <span className="h-1.5 w-40 overflow-hidden rounded-full bg-line-2"><span className="block h-full rounded-full bg-ink" style={{ width: `${r.confidence * 100}%` }} /></span>
            </dd>
          </dl>
          <p className="mt-4 text-[14px] leading-relaxed text-ink-2">{r.reason}</p>

          {confirmed ? (
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg bg-keep-soft px-3 py-2.5 text-[14px]">
              <span className="font-semibold text-keep">
                {job.category_source === 'ai' ? `Accepted: ${categoryById(confirmed).label}` : `Chosen by you: ${categoryById(confirmed).label}`}
              </span>
              {!choosing && <button className="text-ink-2 underline underline-offset-2" onClick={() => setChoosing(true)}>Change</button>}
            </div>
          ) : (
            !choosing && (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="primary" disabled={saving} onClick={() => confirm(r.predicted_category, 'ai')}>Accept AI suggestion</Button>
                <Button disabled={saving} onClick={() => setChoosing(true)}>Choose category manually</Button>
              </div>
            )
          )}

          {choosing && (
            <div className="step-in mt-5 border-t border-line-2 pt-4">
              <p className="text-[14px] font-semibold">Choose the category</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <Choice key={c.id} selected={pick === c.id} onClick={() => setPick(c.id)}>
                    {c.label}{c.id === r.predicted_category ? ' (AI)' : ''}
                  </Choice>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="primary" disabled={saving} onClick={() => confirm(pick, pick === r.predicted_category ? 'ai' : 'manual')}>Use {categoryById(pick).label}</Button>
                <Button variant="ghost" onClick={() => setChoosing(false)}>Cancel</Button>
              </div>
            </div>
          )}
          {err && <p role="alert" className="mt-3 text-[13px] font-medium text-risk">{err}</p>}
        </Card>

        {/* Evidence */}
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Why: the frames that matched best</h2>
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {r.evidence.map((e) => (
              <li key={e.frame_url}>
                <img src={e.frame_url} alt={`Frame at ${tc(e.time)}`} className="aspect-video w-full rounded-md bg-line-2 object-cover" />
                <p className="tnum mt-1 text-[12px] font-medium">{tc(e.time)}, {Math.round(e.score * 100)}%</p>
                <p className="text-[12px] leading-snug text-muted">"{e.matched}"</p>
              </li>
            ))}
          </ul>
          <h3 className="mt-5 text-[13px] font-medium text-ink-2">All scores</h3>
          <ul className="mt-2 space-y-1.5">
            {r.alternatives.map((a) => (
              <li key={a.category} className="grid grid-cols-[120px_1fr_40px] items-center gap-2 text-[13px]">
                <span>{a.label}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-line-2"><span className="block h-full rounded-full bg-ink-2" style={{ width: `${a.confidence * 100}%` }} /></span>
                <span className="tnum text-right text-muted">{Math.round(a.confidence * 100)}%</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {confirmed && <AfterConfirm result={r} category={confirmed} />}
    </Shell>
  )
}

function AfterConfirm({ result: r, category }: { result: AnalysisResult; category: CategoryId }) {
  const { state, dispatch } = useStore()
  const video = state.video!
  const lens = categoryById(category)
  const ranked = useMemo(() => {
    const scores = scoreAll(video, { category, audience: 'general', purpose: 'full', targetSeconds: video.duration, requirements: [], lockedTopics: [], instruction: '' })
    return [...video.segments].sort((a, b) => scores.get(b.id)! - scores.get(a.id)!).slice(0, 6)
  }, [video, category])
  const dark = r.scenes.filter((s) => s.dark).length
  const dups = r.scenes.filter((s) => s.duplicate_of !== null).length

  return (
    <div className="mt-6 space-y-6">
      <Card className="p-5 sm:p-6">
        <label htmlFor="intent" className="text-[15px] font-semibold">What are you trying to say with this video?</label>
        <p className="mt-0.5 text-[13px] text-muted">Optional. Every cut is weighed against this. It can't be inferred from pictures alone yet, because speech isn't analysed.</p>
        <textarea
          id="intent"
          rows={2}
          value={state.intent}
          placeholder="e.g. Show how our app saves people time"
          onChange={(e) => dispatch({ type: 'set-intent', intent: e.target.value })}
          className="mt-3 w-full resize-none rounded-lg border border-line bg-paper/50 px-3 py-2.5 font-serif text-[19px] italic leading-snug text-ink outline-none focus:border-ink-2"
        />
      </Card>

      <Card className="p-5">
        <h2 className="text-[15px] font-semibold">Scenes</h2>
        <div className="mt-3 flex h-10 gap-[2px] overflow-hidden rounded-lg" role="img" aria-label="Detected scenes across the video">
          {r.scenes.map((s) => (
            <div
              key={s.index}
              title={`Scene ${s.index + 1}, ${tc(s.start)}–${tc(s.end)}`}
              style={{ flex: s.end - s.start, backgroundImage: s.dark ? undefined : `url(${s.keyframe_url})` }}
              className={cx('bg-cover bg-center', s.dark && 'hatch bg-cut-soft', s.duplicate_of !== null && 'opacity-50')}
            />
          ))}
        </div>
        <p className="mt-2 text-[13px] text-muted">
          {r.scenes.length} scenes found from cuts in the picture. {dark ? `${dark} dark or blank. ` : ''}{dups ? `${dups} look like an earlier scene. ` : ''}
        </p>

        <h3 className="mt-5 text-[13px] font-medium text-ink-2">Scenes that look most like {lens.label.toLowerCase()}</h3>
        <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {ranked.map((s) => (
            <li key={s.id}>
              {s.keyframeUrl && <img src={s.keyframeUrl} alt="" className="aspect-video w-full rounded-md bg-line-2 object-cover" />}
              <p className="tnum mt-1 text-[12px]"><span className="font-medium">{s.title.replace(/ \(.+\)$/, '')}</span> <span className="text-muted">{tc(s.start)}</span></p>
              <p className="tnum text-[12px] text-muted">{Math.round((s.categoryScores?.[category] ?? 0) * 100)}% match</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <h2 className="text-[15px] font-semibold">Not analysed yet</h2>
        <p className="mt-1 max-w-[75ch] text-[14px] text-ink-2">
          Speech, speakers, languages, repetition in what's said, corrections and question-and-answer links all need a transcript. Until speech-to-text is added, editing decisions use the picture only, and ContextGuard has no sentences to check.
        </p>
      </Card>
    </div>
  )
}
