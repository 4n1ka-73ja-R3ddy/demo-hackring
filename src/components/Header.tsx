import { useStore, type Stage } from '../state/store'
import { cx } from './ui'

const STAGES: { id: Stage; label: string }[] = [
  { id: 'upload', label: 'Footage' },
  { id: 'understand', label: 'Understand' },
  { id: 'brief', label: 'Brief' },
  { id: 'edit', label: 'Edit and refine' },
]

export function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#16213A" />
      <rect x="5" y="12" width="7" height="8" rx="1.5" fill="#0F7B6C" />
      <rect x="13.5" y="12" width="4" height="8" rx="1.5" fill="#9AA3B2" opacity=".55" />
      <rect x="19" y="12" width="8" height="8" rx="1.5" fill="#6B60F0" />
    </svg>
  )
}

export function Header() {
  const { state, dispatch } = useStore()
  const reached = (id: Stage) => {
    if (id === 'upload') return true
    if (id === 'understand') return !!(state.upload || state.job)
    if (!state.video) return false
    if (id === 'edit') return state.versions.length > 0
    return true
  }
  const current = STAGES.findIndex((s) => s.id === state.stage)
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
        <button className="flex items-center gap-2" onClick={() => dispatch({ type: 'reset' })} aria-label="Cutwise, start over">
          <Logo />
          <span className="text-[17px] font-bold tracking-tight">Cutwise</span>
        </button>
        <nav aria-label="Workflow" className="ml-2 hidden items-center md:flex">
          {STAGES.map((s, i) => (
            <div key={s.id} className="flex items-center">
              {i > 0 && <span className="mx-2 h-px w-5 bg-line" aria-hidden />}
              <button
                disabled={!reached(s.id)}
                onClick={() => dispatch({ type: 'go', stage: s.id })}
                aria-current={state.stage === s.id ? 'step' : undefined}
                className={cx(
                  'flex items-center gap-2 rounded-md px-1.5 py-1 text-[13px] disabled:cursor-default',
                  state.stage === s.id ? 'font-semibold text-ink' : i < current ? 'text-ink-2 hover:text-ink' : 'text-muted/70',
                )}
              >
                <span
                  className={cx(
                    'tnum grid size-5 place-items-center rounded-full text-[11px] font-semibold',
                    state.stage === s.id ? 'bg-ink text-white' : i < current ? 'bg-keep-soft text-keep' : 'border border-line text-muted',
                  )}
                >
                  {i + 1}
                </span>
                {s.label}
              </button>
            </div>
          ))}
        </nav>
        {state.uploadedName && (
          <div className="ml-auto truncate text-right text-[13px] text-muted">
            <span className="hidden sm:inline">Source: </span>
            <span className="font-medium text-ink-2">{state.uploadedName}</span>
          </div>
        )}
      </div>
    </header>
  )
}
