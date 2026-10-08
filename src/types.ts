// Core domain types. These mirror what the backend will eventually return,
// so the mock service in src/services can be swapped for real API calls.

export type CategoryId =
  | 'education'
  | 'sports'
  | 'vlog'
  | 'food'
  | 'podcast'
  | 'interview'
  | 'travel'
  | 'gaming'
  | 'product'
  | 'business'
  | 'entertainment'
  | 'other'

export type AudienceId =
  | 'general'
  | 'beginner'
  | 'student'
  | 'professional'
  | 'children'
  | 'followers'
  | 'custom'

export type PurposeId =
  | 'full'
  | 'summary'
  | 'highlights'
  | 'revision'
  | 'short'
  | 'trailer'
  | 'promo'
  | 'custom'

/** What a stretch of footage *is*. Category strategies weight these. */
export type Tag =
  // education
  | 'intro'
  | 'concept'
  | 'definition'
  | 'example'
  | 'demonstration'
  | 'explanation'
  | 'warning'
  | 'correction'
  | 'conclusion'
  | 'advanced'
  | 'question'
  | 'answer'
  // sports / gaming
  | 'goal'
  | 'key-play'
  | 'save'
  | 'foul'
  | 'near-miss'
  | 'celebration'
  | 'build-up'
  // vlog / travel / food
  | 'story'
  | 'location'
  | 'experience'
  | 'reaction'
  | 'funny'
  | 'emotional'
  | 'scenic'
  | 'recommendation'
  // filler
  | 'repetition'
  | 'tangent'
  | 'pause'
  | 'noise'
  | 'logistics'
  | 'mistake'

/** A cut *inside* a segment (filler words, a pause, a false start). */
export interface InnerCut {
  id: string
  label: string
  before: string // sentence as spoken
  after: string // sentence once the cut is applied
  saves: number // seconds removed
  /** A tighter cut ContextGuard proposes instead, if this one is unsafe. */
  safeAlternative?: string
  /** If set, ContextGuard should flag this cut. */
  meaningChange?: {
    kind: 'negation' | 'qualifier' | 'attribution'
    detail: string
  }
}

export interface Segment {
  id: string
  start: number // seconds in source
  end: number
  speaker: string
  lang: string[] // e.g. ['en'] or ['en', 'hi']
  title: string // short label shown on timeline
  text: string // transcript excerpt
  tags: Tag[]
  importance: number // 0..1 base importance from analysis
  topics: string[] // topic ids from Video.topics
  /** Kept segment would not make sense without these. */
  dependsOn?: string[]
  /** This segment repeats content first said in another segment. */
  repeats?: string
  /** This segment corrects a mistake made in another segment. */
  corrects?: string
  /** Suitability by audience: 1 neutral, >1 favoured, <1 disfavoured. */
  audienceFit?: Partial<Record<AudienceId, number>>
  innerCuts?: InnerCut[]
  noise?: 'low' | 'medium' | 'high'
  /** Keyframe thumbnail from the analysis backend */
  keyframeUrl?: string
  /** Per-category visual match for this scene, from the analysis backend */
  categoryScores?: Partial<Record<CategoryId, number>>
  /** The tightest self-contained part of the segment, used when time is short. */
  core?: { start: number; end: number; text: string }
}

export interface Topic {
  id: string
  name: string
  aliases: string[] // words a creator might use to refer to it
}

export interface Speaker {
  id: string
  name: string
  role: string
}

/** Shape returned by the analysis backend (backend/app/analysis.py). */
export interface AnalysisScene {
  index: number
  start: number
  end: number
  keyframe_url: string
  scores: Partial<Record<CategoryId, number>>
  dark: boolean
  duplicate_of: number | null
}

export interface AnalysisResult {
  video_id: string
  predicted_category: CategoryId
  predicted_label: string
  confidence: number
  reason: string
  alternatives: { category: CategoryId; label: string; confidence: number }[]
  evidence: { time: number; frame_url: string; category: CategoryId; score: number; matched: string }[]
  scenes: AnalysisScene[]
  metadata: { file_name: string; duration: number; fps: number; width: number; height: number; frames_analyzed: number; model: string }
}

export interface AnalysisJob {
  video_id: string
  file_name: string
  status: 'queued' | 'processing' | 'done' | 'error'
  stage: string
  progress: number
  error: string | null
  result: AnalysisResult | null
  confirmed_category: CategoryId | null
  category_source: 'ai' | 'manual' | null
}

/** Pipeline input, built from a real analysis once the creator confirms the category. */
export interface Video {
  id: string
  title: string
  fileName: string
  duration: number
  detectedCategory: CategoryId
  categoryConfidence: number
  alternatives: { id: CategoryId; confidence: number }[]
  /** Written by the creator. Empty until speech analysis exists. */
  intent: string
  /** Filled by speech-to-text and diarisation (not built yet): empty for now. */
  speakers: Speaker[]
  languages: { code: string; name: string; share: number }[]
  topics: Topic[]
  segments: Segment[]
  videoUrl: string | null
  posterUrl: string | null
  analysis: AnalysisResult
}

export type Decision = 'keep' | 'remove' | 'protected' | 'risk'

export interface SegmentDecision {
  segmentId: string
  decision: Decision
  reason: string
  importance: 'High' | 'Medium' | 'Low'
  score: number
  contextRisk: 'High' | 'Medium' | 'Low'
  /** Kept seconds, after trimming to core and inner cuts */
  keptSeconds: number
  trimmedToCore: boolean
  /** Inner cuts that were applied (accepted) */
  appliedCuts: string[]
  /** Inner cuts ContextGuard rejected */
  rejectedCuts: string[]
  source: 'agent' | 'creator'
}

export type GuardIssueKind =
  | 'meaning-change'
  | 'missing-context'
  | 'removed-correction'
  | 'orphaned-answer'
  | 'contradiction'

export interface GuardIssue {
  id: string
  kind: GuardIssueKind
  segmentId: string
  relatedId?: string
  cutId?: string
  severity: 'high' | 'medium'
  title: string
  detail: string
  before?: string
  after?: string
  resolution: 'auto-fixed' | 'needs-review' | 'accepted-by-creator'
  resolutionNote: string
}

export interface AgentStep {
  id: string
  label: string
  detail: string
  status: 'done' | 'warn' | 'retry'
}

export interface Brief {
  category: CategoryId
  audience: AudienceId
  customAudience?: string
  purpose: PurposeId
  targetSeconds: number
  requirements: RequirementId[]
  /** Topic ids the creator explicitly asked to keep */
  lockedTopics: string[]
  instruction: string
}

export type RequirementId =
  | 'keep-examples'
  | 'keep-conclusion'
  | 'keep-warnings'
  | 'remove-repetition'
  | 'remove-tangents'
  | 'remove-pauses'
  | 'keep-corrections'

export interface Overrides {
  /** segmentId -> forced decision by the creator */
  [segmentId: string]: 'keep' | 'remove' | 'protect'
}

export interface EditPlan {
  decisions: SegmentDecision[]
  issues: GuardIssue[]
  steps: AgentStep[]
  outputSeconds: number
  hitTarget: boolean
  replans: number
}

export interface Version {
  id: string
  name: string
  parentId: string | null
  brief: Brief
  overrides: Overrides
  plan: EditPlan
  createdAt: number
  instruction: string
}

export interface ChatMessage {
  id: string
  role: 'creator' | 'agent'
  text: string
  /** version produced by this message, if any */
  versionId?: string
  bullets?: string[]
}
