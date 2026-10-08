import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Decision } from '../types'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'quiet'; size?: 'sm' | 'md' }
export function Button({ variant = 'secondary', size = 'md', className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-10 px-4 text-sm',
        variant === 'primary' && 'bg-ink text-white hover:bg-ink-2',
        variant === 'secondary' && 'border border-line bg-card text-ink hover:border-ink-2/40',
        variant === 'ghost' && 'text-ink-2 hover:bg-line-2',
        variant === 'quiet' && 'text-muted hover:text-ink',
        className,
      )}
    />
  )
}

export const DECISION_META: Record<Decision, { label: string; text: string; bg: string; bar: string }> = {
  keep: { label: 'Keep', text: 'text-keep', bg: 'bg-keep-soft', bar: 'bg-keep' },
  remove: { label: 'Cut', text: 'text-muted', bg: 'bg-cut-soft', bar: 'bg-cut' },
  protected: { label: 'Protected', text: 'text-guard', bg: 'bg-guard-soft', bar: 'bg-guard' },
  risk: { label: 'Context risk', text: 'text-risk', bg: 'bg-risk-soft', bar: 'bg-risk' },
}

export function DecisionBadge({ d, className }: { d: Decision; className?: string }) {
  const m = DECISION_META[d]
  return (
    <span className={cx('inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] font-semibold', m.bg, m.text, className)}>
      <DecisionGlyph d={d} />
      {m.label}
    </span>
  )
}

/** Shape as well as colour, so decisions survive greyscale and colour blindness. */
export function DecisionGlyph({ d, size = 10 }: { d: Decision; size?: number }) {
  if (d === 'keep') return <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden><rect width="10" height="10" rx="2" fill="currentColor" /></svg>
  if (d === 'remove') return <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
  if (d === 'protected') return <svg width={size} height={size + 1} viewBox="0 0 10 11" aria-hidden><path d="M5 .5l4 1.6v3.2C9 8 7.2 9.8 5 10.5 2.8 9.8 1 8 1 5.3V2.1z" fill="currentColor" /></svg>
  return <svg width={size + 1} height={size} viewBox="0 0 11 10" aria-hidden><path d="M5.5.5l5 9h-10z" fill="currentColor" /></svg>
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-xl border border-line bg-card', className)}>{children}</section>
}

export function Choice({ selected, onClick, children, title }: { selected: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'h-9 rounded-lg border px-3 text-[13px] font-medium transition-colors',
        selected ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink-2 hover:border-ink-2/40',
      )}
    >
      {children}
    </button>
  )
}

export function MicIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 7.5a5 5 0 0010 0M8 12.5v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function SpeakerChip({ name }: { name: string }) {
  return <span className="text-[12px] text-muted">{name}</span>
}
