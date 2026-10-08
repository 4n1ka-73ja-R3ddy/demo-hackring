// Client for the analysis backend (backend/app/main.py). In dev, Vite proxies /api to it.
import type { AnalysisJob, CategoryId } from '../types'

export class ApiError extends Error {}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try { const b = await res.json(); msg = typeof b.detail === 'string' ? b.detail : JSON.stringify(b.detail) } catch { /* not JSON */ }
    throw new ApiError(msg)
  }
  return res.json() as Promise<T>
}

/** Upload with progress. Resolves with the new job id once the server has validated the file. */
export function uploadVideo(file: File, onProgress: (fraction: number) => void): Promise<{ video_id: string; status: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/videos')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      let body: { detail?: unknown; video_id?: string; status?: string } = {}
      try { body = JSON.parse(xhr.responseText) } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.video_id) resolve(body as { video_id: string; status: string })
      else reject(new ApiError(typeof body.detail === 'string' ? body.detail : `Upload failed (${xhr.status || 'no response'}). Is the analysis server running?`))
    }
    xhr.onerror = () => reject(new ApiError('Could not reach the analysis server. Start it with: uvicorn app.main:app --port 8000 (in the backend folder).'))
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}

export const getJob = (id: string) => fetch(`/api/videos/${id}`).then((r) => json<AnalysisJob>(r))

export const confirmCategory = (id: string, category: CategoryId, source: 'ai' | 'manual') =>
  fetch(`/api/videos/${id}/category`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, source }),
  }).then((r) => json<AnalysisJob>(r))
