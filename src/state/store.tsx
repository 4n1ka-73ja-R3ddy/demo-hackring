import { createContext, useContext, useReducer, type ReactNode } from 'react'
import type { AnalysisJob, Brief, CategoryId, ChatMessage, Version, Video } from '../types'

export type Stage = 'upload' | 'understand' | 'brief' | 'edit'

export interface AppState {
  stage: Stage
  /** Upload in progress (before the server has a job id) */
  upload: { fileName: string; progress: number; error: string | null } | null
  /** Analysis job as last reported by the backend */
  job: AnalysisJob | null
  /** Local object URL for previewing the uploaded file */
  videoUrl: string | null
  /** Built from the analysis once the creator confirms the category */
  video: Video | null
  uploadedName: string | null
  category: CategoryId | null
  intent: string
  briefDraft: Brief | null
  versions: Version[]
  activeVersionId: string | null
  selectedSegmentId: string | null
  chat: ChatMessage[]
  /** Version whose agent run is currently animating */
  runningVersionId: string | null
  sidePanel: 'why' | 'guard' | 'agent'
}

const initial: AppState = {
  stage: 'upload',
  upload: null,
  job: null,
  videoUrl: null,
  video: null,
  uploadedName: null,
  category: null,
  intent: '',
  briefDraft: null,
  versions: [],
  activeVersionId: null,
  selectedSegmentId: null,
  chat: [],
  runningVersionId: null,
  sidePanel: 'agent',
}

type Action =
  | { type: 'upload-start'; fileName: string; videoUrl: string }
  | { type: 'upload-progress'; progress: number }
  | { type: 'upload-error'; error: string }
  | { type: 'job'; job: AnalysisJob }
  | { type: 'confirm-category'; video: Video; category: CategoryId }
  | { type: 'set-video'; video: Video }
  | { type: 'go'; stage: Stage }
  | { type: 'set-category'; category: CategoryId }
  | { type: 'set-intent'; intent: string }
  | { type: 'set-brief'; brief: Brief }
  | { type: 'add-versions'; versions: Version[]; chat?: ChatMessage[] }
  | { type: 'replace-version'; version: Version }
  | { type: 'activate'; id: string }
  | { type: 'select'; id: string | null; panel?: AppState['sidePanel'] }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'run-done' }
  | { type: 'panel'; panel: AppState['sidePanel'] }
  | { type: 'reset' }

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'upload-start':
      if (s.videoUrl) URL.revokeObjectURL(s.videoUrl)
      return { ...initial, stage: 'understand', upload: { fileName: a.fileName, progress: 0, error: null }, videoUrl: a.videoUrl, uploadedName: a.fileName }
    case 'upload-progress':
      return s.upload ? { ...s, upload: { ...s.upload, progress: a.progress } } : s
    case 'upload-error':
      return s.upload ? { ...s, upload: { ...s.upload, error: a.error } } : s
    case 'job':
      return { ...s, job: a.job }
    case 'confirm-category':
      return { ...s, video: a.video, category: a.category, intent: s.intent, briefDraft: null, versions: [], activeVersionId: null, chat: [] }
    case 'set-video':
      return { ...s, video: a.video }
    case 'go':
      return { ...s, stage: a.stage }
    case 'set-category': {
      return { ...s, category: a.category, briefDraft: s.briefDraft ? { ...s.briefDraft, category: a.category } : null }
    }
    case 'set-intent':
      return { ...s, intent: a.intent }
    case 'set-brief':
      return { ...s, briefDraft: a.brief }
    case 'add-versions': {
      const last = a.versions[a.versions.length - 1]
      return {
        ...s,
        stage: 'edit',
        versions: [...s.versions, ...a.versions],
        activeVersionId: last.id,
        runningVersionId: last.id,
        selectedSegmentId: null,
        sidePanel: 'agent',
        chat: [...s.chat, ...(a.chat ?? [])],
      }
    }
    case 'replace-version':
      return { ...s, versions: s.versions.map((v) => (v.id === a.version.id ? a.version : v)) }
    case 'activate':
      return { ...s, activeVersionId: a.id }
    case 'select':
      return { ...s, selectedSegmentId: a.id, sidePanel: a.panel ?? (a.id ? 'why' : s.sidePanel) }
    case 'chat':
      return { ...s, chat: [...s.chat, a.message] }
    case 'run-done':
      return { ...s, runningVersionId: null }
    case 'panel':
      return { ...s, sidePanel: a.panel }
    case 'reset':
      if (s.videoUrl) URL.revokeObjectURL(s.videoUrl)
      return initial
  }
}

const Ctx = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export function useStore() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useStore outside provider')
  return c
}

export function useActiveVersion() {
  const { state } = useStore()
  return state.versions.find((v) => v.id === state.activeVersionId) ?? null
}
