import { useRef, useState } from 'react'
import { uploadVideo } from '../services/api'
import { useStore } from '../state/store'
import { cx } from '../components/ui'

const ACCEPTED = ['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi']

// Illustration of the idea: one raw recording, three different edits. Not analysis output.
const SOURCE = [3, 5, 2, 7, 4, 6, 3, 8, 2, 5, 4, 6, 3, 5]
const VERSIONS: { name: string; keep: number[]; guard: number[] }[] = [
  { name: 'Beginner lesson', keep: [1, 3, 4, 5, 7, 9, 10, 12], guard: [7] },
  { name: 'Student revision', keep: [3, 5, 7, 12], guard: [5] },
  { name: '60-second short', keep: [5, 7], guard: [7] },
]

function SplitDiagram() {
  return (
    <figure className="rounded-2xl border border-line bg-card p-5 sm:p-6" aria-label="One recording becomes three different edits">
      <div className="mb-1.5 flex justify-between text-[12px] text-muted">
        <span>Raw footage</span>
      </div>
      <div className="flex h-9 gap-[3px]">
        {SOURCE.map((w, i) => (
          <div key={i} style={{ flex: w }} className="rounded-[3px] bg-ink-2/80" />
        ))}
      </div>
      <div className="mt-5 space-y-4">
        {VERSIONS.map((v) => (
          <div key={v.name}>
            <div className="mb-1.5 text-[12px]">
              <span className="font-medium text-ink-2">{v.name}</span>
            </div>
            <div className="flex h-6 gap-[3px]">
              {SOURCE.map((w, i) => {
                const kept = v.keep.includes(i)
                const guard = v.guard.includes(i)
                return (
                  <div
                    key={i}
                    style={{ flex: w }}
                    className={cx('rounded-[3px]', guard ? 'bg-guard' : kept ? 'bg-keep' : 'hatch bg-cut-soft')}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <figcaption className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-keep" />Kept</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-guard" />Protected</span>
        <span className="flex items-center gap-1.5"><i className="hatch size-2.5 rounded-sm bg-cut-soft" />Cut</span>
      </figcaption>
    </figure>
  )
}

export function UploadScreen() {
  const { dispatch } = useStore()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFile = (f?: File | null) => {
    if (!f) return
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
    if (!ACCEPTED.includes(ext)) {
      setError(`${f.name} isn't a supported video. Use ${ACCEPTED.join(', ')}.`)
      return
    }
    setError(null)
    dispatch({ type: 'upload-start', fileName: f.name, videoUrl: URL.createObjectURL(f) })
    uploadVideo(f, (p) => dispatch({ type: 'upload-progress', progress: p }))
      .then(({ video_id }) =>
        dispatch({
          type: 'job',
          job: { video_id, file_name: f.name, status: 'queued', stage: 'Queued', progress: 0, error: null, result: null, confirmed_category: null, category_source: null },
        }),
      )
      .catch((e: Error) => dispatch({ type: 'upload-error', error: e.message }))
  }

  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-10 sm:px-6 lg:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <div>
          <h1 className="max-w-[16ch] text-[40px] font-bold leading-[1.05] tracking-[-0.02em] sm:text-[52px]">
            Raw footage in. The right edit for every audience out.
          </h1>
          <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-ink-2">
            Cutwise works out what your video is, what you meant to say and who it is for. It plans the cuts itself, checks that no cut changes your meaning, and explains every decision.
          </p>

          <div
            onDragOver={(e) => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]) }}
            className={cx(
              'mt-8 flex flex-col items-start gap-3 rounded-xl border-2 border-dashed p-5 transition-colors sm:flex-row sm:items-center',
              over ? 'border-guard bg-guard-soft' : 'border-line bg-card/60',
            )}
          >
            <div className="flex-1">
              <p className="font-semibold">Drop a video file here</p>
              <p className="text-[13px] text-muted">MP4, MOV, M4V, MKV, WebM or AVI. The file is analysed on your analysis server and deleted after a few hours.</p>
            </div>
            <input ref={input} type="file" accept={['video/*', ...ACCEPTED].join(',')} className="sr-only" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
            <button onClick={() => input.current?.click()} className="h-10 rounded-lg bg-ink px-4 text-sm font-medium text-white hover:bg-ink-2">
              Choose file
            </button>
          </div>
          {error && <p role="alert" className="mt-3 text-[14px] font-medium text-risk">{error}</p>}
        </div>
        <SplitDiagram />
      </div>
    </div>
  )
}
