import { useEffect, useState } from 'react'
import { AUDIENCES, PURPOSES, REQUIREMENTS, categoryById } from '../data/categories'
import { toEDL } from '../lib/edit'
import { human, tc, uid } from '../lib/format'
import { applyOverride } from '../services/agent'
import { useActiveVersion, useStore } from '../state/store'
import { Button, Card, cx } from '../components/ui'
import { ChatPanel } from '../components/workspace/ChatPanel'
import { Preview } from '../components/workspace/Preview'
import { SegmentList } from '../components/workspace/SegmentList'
import { SidePanel } from '../components/workspace/SidePanel'
import { Timeline } from '../components/workspace/Timeline'
import { VersionBar } from '../components/workspace/VersionBar'

export function Workspace() {
  const { state, dispatch } = useStore()
  const video = state.video!
  const version = useActiveVersion()!
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [ask, setAsk] = useState<string | null>(null)
  const running = state.runningVersionId === version.id

  useEffect(() => { setT(0); setPlaying(false) }, [version.id])
  useEffect(() => {
    if (!playing || video.videoUrl) return // real footage drives the clock itself
    const iv = setInterval(() => setT((x) => {
      if (x + 0.25 >= version.plan.outputSeconds) { setPlaying(false); return version.plan.outputSeconds }
      return x + 0.25
    }), 250)
    return () => clearInterval(iv)
  }, [playing, version.plan.outputSeconds, video.videoUrl])

  const onAction = (segmentId: string, action: 'keep' | 'remove' | 'protect' | 'clear') => {
    const seg = video.segments.find((s) => s.id === segmentId)!
    const updated = applyOverride(video, version, segmentId, action)
    const fresh = updated.plan.issues.filter((i) => !version.plan.issues.some((o) => o.id === i.id))
    dispatch({ type: 'replace-version', version: updated })
    dispatch({
      type: 'chat',
      message: {
        id: uid('m'),
        role: 'agent',
        text: `${{ keep: 'Restored', remove: 'Cut', protect: 'Protected', clear: 'Reverted to my decision on' }[action]} "${seg.title}". ContextGuard re-checked the edit: now ${tc(updated.plan.outputSeconds)}.`,
        bullets: fresh.map((i) => `${i.resolution === 'needs-review' ? 'Needs your review' : 'Fixed'}: ${i.title}. ${i.resolutionNote}`),
      },
    })
    if (fresh.some((i) => i.resolution === 'needs-review')) dispatch({ type: 'panel', panel: 'guard' })
  }

  const download = () => {
    const blob = new Blob([JSON.stringify(toEDL(video, version), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${video.id}_${version.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}_edl.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const b = version.brief
  const p = version.plan
  const kept = p.decisions.filter((d) => d.decision !== 'remove').length
  const review = p.issues.filter((i) => i.resolution === 'needs-review').length
  const audience = b.audience === 'custom' ? b.customAudience || 'Custom' : AUDIENCES.find((a) => a.id === b.audience)!.label
  const diff = p.outputSeconds - b.targetSeconds

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-5 sm:px-6">
      <VersionBar video={video} />

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <Preview video={video} version={version} t={t} playing={playing} onToggle={() => setPlaying((x) => !x)} onSeek={setT} onEnded={() => setPlaying(false)} />
            <Card className="flex flex-col p-5">
              <h1 className="text-[22px] font-bold leading-tight tracking-tight">{version.name}</h1>
              <p className="mt-1 text-[13px] text-muted">{categoryById(b.category).label} lens, {audience.toLowerCase()} audience, {PURPOSES.find((x) => x.id === b.purpose)!.label.toLowerCase()}</p>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <dt className="text-[12px] text-muted">Length</dt>
                  <dd className="tnum text-[26px] font-bold leading-none">{tc(p.outputSeconds)}</dd>
                  <dd className={cx('tnum mt-1 text-[12px]', p.hitTarget ? 'text-keep' : 'text-risk')}>
                    {Math.abs(diff) < 3 ? 'On target' : `${diff > 0 ? '+' : '−'}${human(Math.abs(diff))} vs ${tc(b.targetSeconds)} target`}
                  </dd>
                </div>
                <div>
                  <dt className="text-[12px] text-muted">From the source</dt>
                  <dd className="tnum text-[26px] font-bold leading-none">{Math.round((p.outputSeconds / video.duration) * 100)}%</dd>
                  <dd className="tnum mt-1 text-[12px] text-muted">{kept} of {p.decisions.length} segments kept</dd>
                </div>
                {(b.requirements.length > 0 || b.lockedTopics.length > 0) && (
                  <div className="col-span-2">
                    <dt className="text-[12px] text-muted">Constraints</dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {b.lockedTopics.map((id) => (
                        <span key={id} className="rounded-md bg-guard-soft px-2 py-0.5 text-[12px] font-medium text-guard">Keep {video.topics.find((x) => x.id === id)?.name.toLowerCase()}</span>
                      ))}
                      {b.requirements.map((r) => (
                        <span key={r} className="rounded-md bg-line-2 px-2 py-0.5 text-[12px] text-ink-2">{REQUIREMENTS.find((x) => x.id === r)?.label}</span>
                      ))}
                    </dd>
                  </div>
                )}
                <div className="col-span-2">
                  <dt className="text-[12px] text-muted">ContextGuard</dt>
                  <dd className="text-[14px]">
                    {p.issues.length === 0 ? 'No meaning changes found.' : (
                      <button className="text-left hover:underline" onClick={() => dispatch({ type: 'panel', panel: 'guard' })}>
                        {p.issues.filter((i) => i.resolution === 'auto-fixed').length} problem{p.issues.filter((i) => i.resolution === 'auto-fixed').length === 1 ? '' : 's'} caught and fixed
                        {review > 0 && <span className="font-semibold text-risk">, {review} need{review === 1 ? 's' : ''} your review</span>}
                      </button>
                    )}
                  </dd>
                </div>
              </dl>
              <div className="mt-auto flex flex-wrap gap-2 pt-5">
                <Button variant="primary" disabled title="Rendering arrives with the FFmpeg backend">Render video</Button>
                <Button onClick={download}>Download edit list</Button>
              </div>
            </Card>
          </div>

          <Card className="p-4 sm:p-5">
            <Timeline video={video} version={version} playhead={t} />
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
              <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-keep" />Keep</span>
              <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-guard" />Protected</span>
              <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-risk" />Context risk</span>
              <span className="flex items-center gap-1.5"><i className="hatch size-2.5 rounded-sm bg-cut-soft" />Cut</span>
            </div>
          </Card>

          <SegmentList video={video} version={version} onAction={onAction} dimmed={running} />
        </div>

        <aside className="flex h-[min(860px,calc(100vh-96px))] flex-col overflow-hidden rounded-xl border border-line bg-card lg:sticky lg:top-[72px]">
          <SidePanel video={video} version={version} onAction={onAction} onAsk={setAsk} />
          <div className="h-[44%] min-h-[260px] shrink-0 bg-card">
            <ChatPanel video={video} version={version} pendingAsk={ask} clearAsk={() => setAsk(null)} />
          </div>
        </aside>
      </div>
    </div>
  )
}
