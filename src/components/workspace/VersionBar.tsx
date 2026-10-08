import { tc } from '../../lib/format'
import { useStore } from '../../state/store'
import type { Video } from '../../types'
import { cx } from '../ui'

/** Every version is cut from the same source. Lineage shows what each was refined from. */
export function VersionBar({ video }: { video: Video }) {
  const { state, dispatch } = useStore()
  const name = (id: string | null) => state.versions.find((v) => v.id === id)?.name
  return (
    <div className="flex items-stretch gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Versions">
      <div className="flex shrink-0 flex-col justify-center rounded-lg border border-dashed border-line px-3 py-2">
        <p className="text-[12px] text-muted">Source</p>
        <p className="tnum text-[14px] font-semibold">{tc(video.duration)}</p>
      </div>
      {state.versions.map((v) => {
        const active = v.id === state.activeVersionId
        return (
          <button
            key={v.id}
            role="tab"
            aria-selected={active}
            onClick={() => dispatch({ type: 'activate', id: v.id })}
            className={cx('shrink-0 rounded-lg border px-3 py-2 text-left transition-colors', active ? 'border-ink bg-ink text-white' : 'border-line bg-card hover:border-ink-2/40')}
          >
            <p className={cx('text-[12px]', active ? 'text-white/70' : 'text-muted')}>{v.parentId ? `Refined from ${name(v.parentId)}` : 'From source'}</p>
            <p className="text-[14px] font-semibold">
              {v.name}
              <span className={cx('tnum ml-2 font-normal', active ? 'text-white/80' : 'text-muted')}>{tc(v.plan.outputSeconds)}</span>
              {v.plan.issues.some((i) => i.resolution === 'needs-review') && <span className="ml-1.5 inline-block size-2 rounded-full bg-risk" aria-label="Needs review" />}
            </p>
          </button>
        )
      })}
    </div>
  )
}
