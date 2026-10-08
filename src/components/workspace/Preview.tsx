import { useEffect, useRef } from 'react'
import { outputClips, spokenText, type OutputClip } from '../../lib/edit'
import { tc } from '../../lib/format'
import type { Version, Video } from '../../types'
import { DecisionBadge } from '../ui'

const srcIn = (c: OutputClip) => (c.d.trimmedToCore && c.seg.core ? c.seg.core.start : c.seg.start)

/**
 * Preview of the edit. With the uploaded file available it plays the real
 * footage, jumping from clip to clip along the Edit Decision List. The final
 * render will come from FFmpeg on the server.
 */
export function Preview({ video, version, t, playing, onToggle, onSeek, onEnded }: {
  video: Video
  version: Version
  t: number
  playing: boolean
  onToggle: () => void
  onSeek: (t: number) => void
  onEnded: () => void
}) {
  const clips = outputClips(video, version)
  const out = version.plan.outputSeconds
  const clipAt = (x: number) => clips.findIndex((c) => x >= c.outStart && x < c.outEnd)
  const ci = clipAt(t)
  const clip = clips[ci >= 0 ? ci : clips.length - 1]
  const speaker = clip && video.speakers.find((s) => s.id === clip.seg.speaker)
  const srcTime = clip ? srcIn(clip) + Math.max(0, t - clip.outStart) : 0

  const ref = useRef<HTMLVideoElement>(null)
  const idx = useRef(0)

  // Start or stop real playback.
  useEffect(() => {
    const v = ref.current
    if (!v || !video.videoUrl) return
    if (playing && clips.length) {
      idx.current = Math.max(0, clipAt(t))
      const c = clips[idx.current]
      v.currentTime = srcIn(c) + Math.max(0, t - c.outStart)
      v.play().catch(() => onEnded())
    } else v.pause()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, version.id])

  // While paused, show the frame under the playhead.
  useEffect(() => {
    const v = ref.current
    if (!v || playing || !clip) return
    if (Math.abs(v.currentTime - srcTime) > 0.3) v.currentTime = srcTime
  }, [t, playing, clip, srcTime])

  const onTimeUpdate = () => {
    const v = ref.current
    if (!v || !playing) return
    let c = clips[idx.current]
    if (!c) return
    if (v.currentTime >= srcIn(c) + c.d.keptSeconds) {
      idx.current++
      c = clips[idx.current]
      if (!c) { v.pause(); onSeek(out); onEnded(); return }
      v.currentTime = srcIn(c)
    }
    onSeek(Math.min(out, c.outStart + Math.max(0, v.currentTime - srcIn(c))))
  }

  return (
    <div className="overflow-hidden rounded-xl bg-ink">
      <div className="relative aspect-video w-full bg-black">
        {video.videoUrl ? (
          <video ref={ref} src={video.videoUrl} className="absolute inset-0 h-full w-full object-contain" playsInline onTimeUpdate={onTimeUpdate} />
        ) : video.posterUrl ? (
          <img src={video.posterUrl} alt="" className="absolute inset-0 h-full w-full object-contain opacity-70" />
        ) : null}
        <div className="absolute left-3 top-3 flex items-center gap-2">
          {clip && <DecisionBadge d={clip.d.decision} className="bg-white/90" />}
          <span className="tnum rounded bg-black/50 px-1.5 py-0.5 text-[12px] text-white/90">{clip?.seg.title.replace(/ \(.+\)$/, '')}, source {tc(srcTime)}</span>
        </div>
        {clip?.seg.text && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-5 pb-4 pt-12">
            {speaker && <p className="text-[12px] font-medium text-white/70">{speaker.name}</p>}
            <p className="mt-0.5 font-serif text-[clamp(16px,2.1vw,21px)] leading-snug text-white">{spokenText(clip.seg, clip.d)}</p>
          </div>
        )}
        {!clips.length && <p className="absolute inset-0 grid place-items-center text-white/70">Nothing kept in this version.</p>}
      </div>
      <div className="flex items-center gap-3 px-3 py-2.5 text-white">
        <button onClick={onToggle} disabled={!clips.length} aria-label={playing ? 'Pause preview' : 'Play preview'} className="grid size-8 place-items-center rounded-full bg-white text-ink disabled:opacity-40">
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><rect x="2" y="1" width="3" height="10" fill="currentColor" /><rect x="7" y="1" width="3" height="10" fill="currentColor" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M3 1.5v9l7.5-4.5z" fill="currentColor" /></svg>
          )}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(1, out)}
          step={0.5}
          value={t}
          disabled={playing}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Seek in edited version"
          className="h-1 flex-1 cursor-pointer accent-white"
        />
        <span className="tnum text-[12px] text-white/80">{tc(t)} / {tc(out)}</span>
      </div>
    </div>
  )
}
