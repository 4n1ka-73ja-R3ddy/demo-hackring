import { outputClips } from '../../lib/edit'
import { tc } from '../../lib/format'
import { useStore } from '../../state/store'
import type { Decision, Version, Video } from '../../types'
import { cx } from '../ui'

const FILL: Record<Decision, string> = { keep: '#0F7B6C', protected: '#4B3FD1', risk: '#B45F00', remove: '#9AA3B2' }

/**
 * The cutting-room view: the full source on top, this version underneath,
 * and a band joining every kept piece of source to where it lands in the edit.
 */
export function Timeline({ video, version, playhead }: { video: Video; version: Version; playhead: number }) {
  const { state, dispatch } = useStore()
  const clips = outputClips(video, version)
  const out = Math.max(1, clips.reduce((a, c) => a + c.d.keptSeconds, 0))
  const pct = (s: number) => (s / video.duration) * 100
  const opct = (s: number) => (s / out) * 100
  const sel = state.selectedSegmentId
  const ratio = Math.round((version.plan.outputSeconds / video.duration) * 100)

  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[12px] text-muted">
        <span>Source footage</span>
        <span className="tnum">{tc(video.duration)}</span>
      </div>
      <div className="relative h-9 overflow-hidden rounded-md bg-line-2">
        {video.segments.map((s) => {
          const d = version.plan.decisions.find((x) => x.segmentId === s.id)!
          return (
            <button
              key={s.id}
              onClick={() => dispatch({ type: 'select', id: s.id })}
              title={`${tc(s.start)} ${s.title}: ${d.decision === 'remove' ? 'cut' : d.decision}`}
              aria-label={`${s.title}, ${d.decision === 'remove' ? 'cut' : d.decision}`}
              style={{ left: `${pct(s.start)}%`, width: `${pct(s.end - s.start)}%`, background: d.decision === 'remove' ? undefined : FILL[d.decision] }}
              className={cx(
                'absolute inset-y-0 border-r border-card/70 transition-[filter]',
                d.decision === 'remove' && 'hatch bg-cut-soft',
                sel === s.id && 'z-10 ring-2 ring-ink ring-inset',
                'hover:brightness-110',
              )}
            />
          )
        })}
      </div>

      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="block h-11 w-full" aria-hidden>
        {clips.map((c) => {
          const a = pct(c.seg.start)
          const b = pct(c.seg.end)
          const x1 = opct(c.outStart)
          const x2 = opct(c.outEnd)
          return (
            <polygon
              key={c.seg.id}
              points={`${a},0 ${b},0 ${x2},40 ${x1},40`}
              fill={FILL[c.d.decision]}
              opacity={sel === c.seg.id ? 0.45 : 0.16}
            />
          )
        })}
      </svg>

      <div className="relative h-9 overflow-hidden rounded-md bg-line-2">
        {clips.map((c) => (
          <button
            key={c.seg.id}
            onClick={() => dispatch({ type: 'select', id: c.seg.id })}
            title={`${c.seg.title}, ${Math.round(c.d.keptSeconds)}s`}
            style={{ left: `${opct(c.outStart)}%`, width: `${opct(c.d.keptSeconds)}%`, background: FILL[c.d.decision] }}
            className={cx('absolute inset-y-0 overflow-hidden border-r-2 border-card px-1.5 text-left text-[11px] font-medium leading-9 text-white', sel === c.seg.id && 'z-10 ring-2 ring-ink ring-inset')}
          >
            <span className="block truncate">{c.seg.title}</span>
          </button>
        ))}
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${opct(playhead)}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[12px] text-muted">
        <span>This version, {ratio}% of the source</span>
        <span className="tnum">{tc(version.plan.outputSeconds)}</span>
      </div>
    </div>
  )
}
