import { useEffect, useRef, useState } from 'react'
import { chatSuggestions } from '../../data'
import { uid } from '../../lib/format'
import { sendMessage } from '../../services/agent'
import { useStore } from '../../state/store'
import type { Version, Video } from '../../types'
import { MicIcon, cx } from '../ui'

export function ChatPanel({ video, version, pendingAsk, clearAsk }: { video: Video; version: Version; pendingAsk: string | null; clearAsk: () => void }) {
  const { state, dispatch } = useStore()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const used = new Set(state.chat.filter((m) => m.role === 'creator').map((m) => m.text))
  const suggestions = chatSuggestions.filter((s) => !used.has(s))

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [state.chat.length, busy])

  const send = async (msg: string) => {
    const t = msg.trim()
    if (!t || busy) return
    setText('')
    dispatch({ type: 'chat', message: { id: uid('m'), role: 'creator', text: t } })
    setBusy(true)
    const r = await sendMessage(t, video, version)
    setBusy(false)
    if (r.newVersion) dispatch({ type: 'add-versions', versions: [r.newVersion], chat: [r.reply] })
    else {
      if (r.updatedVersion) dispatch({ type: 'replace-version', version: r.updatedVersion })
      dispatch({ type: 'chat', message: r.reply })
    }
  }

  useEffect(() => {
    if (pendingAsk) { send(pendingAsk); clearAsk() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAsk])

  const voice = () => {
    if (listening || !suggestions[0]) return
    setListening(true)
    setTimeout(() => { setListening(false); setText(suggestions[0]) }, 1100)
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-line">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {state.chat.map((m) => (
          <div key={m.id} className={cx('flex', m.role === 'creator' ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[88%] rounded-xl px-3 py-2 text-[14px] leading-snug', m.role === 'creator' ? 'bg-ink text-white' : 'bg-paper text-ink')}>
              <p>{m.text}</p>
              {m.bullets && m.bullets.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[13px] text-ink-2">
                  {m.bullets.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              )}
              {m.versionId && m.versionId !== state.activeVersionId && state.versions.some((v) => v.id === m.versionId) && (
                <button className="mt-1.5 text-[13px] font-medium text-guard hover:underline" onClick={() => dispatch({ type: 'activate', id: m.versionId! })}>
                  Open this version
                </button>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="flex items-center gap-2 text-[13px] text-muted"><i className="pulse-dot size-2 rounded-full bg-ink" />Re-planning from "{version.name}"…</p>}
        <div ref={end} />
      </div>
      {suggestions.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => send(s)} disabled={busy} className="shrink-0 rounded-full border border-line bg-card px-2.5 py-1 text-[12px] text-ink-2 hover:border-ink-2/40">
              {s}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); send(text) }} className="flex items-center gap-2 border-t border-line-2 p-3">
        <label htmlFor="chat" className="sr-only">Tell the agent what to change</label>
        <input
          id="chat"
          value={listening ? '' : text}
          onChange={(e) => setText(e.target.value)}
          placeholder={listening ? 'Listening…' : `Change "${version.name}"…`}
          className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-card px-3 text-[14px] outline-none focus:border-ink-2"
        />
        <button type="button" onClick={voice} aria-label="Speak" className={cx('grid size-10 shrink-0 place-items-center rounded-lg', listening ? 'bg-risk text-white' : 'border border-line bg-card text-ink')}>
          {listening ? <i className="pulse-dot size-2 rounded-full bg-white" /> : <MicIcon />}
        </button>
        <button type="submit" disabled={!text.trim() || busy} className="h-10 shrink-0 rounded-lg bg-ink px-3.5 text-[14px] font-medium text-white disabled:opacity-40">Send</button>
      </form>
    </div>
  )
}
