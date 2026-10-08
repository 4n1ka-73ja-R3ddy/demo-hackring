// Mock agentic edit planner. Deterministic, so the demo is repeatable, but it
// genuinely reacts to category, audience, purpose, duration, requirements,
// locked topics and creator overrides. The backend version replaces this with
// LLM reasoning over the transcript; the inputs and outputs stay the same.

import {
  AUDIENCES,
  AUDIENCE_TAG_BIAS,
  PURPOSES,
  PURPOSE_TAG_BIAS,
  REQUIREMENTS,
  categoryById,
} from '../data/categories'
import { human, tc } from '../lib/format'
import type {
  AgentStep,
  Brief,
  EditPlan,
  GuardIssue,
  Overrides,
  Segment,
  SegmentDecision,
  Tag,
  Video,
} from '../types'
import { runContextGuard, type Selection } from './contextGuard'

export const FILLER_TAGS: Tag[] = ['repetition', 'tangent', 'pause', 'noise', 'logistics', 'mistake']
const isFiller = (s: Segment) => s.tags.some((t) => FILLER_TAGS.includes(t))

/**
 * @param sceneMax  For scenes from the analysis backend: the best category match of
 *                  any scene in this video, so scenes are ranked relative to each other
 *                  (a chosen category that fits the whole video weakly still yields an edit).
 */
export function scoreSegment(seg: Segment, brief: Brief, sceneMax = 1) {
  const lens = categoryById(brief.category).weights
  const content = seg.tags.filter((t) => !FILLER_TAGS.includes(t))
  const filler = seg.tags.filter((t) => FILLER_TAGS.includes(t))
  const positive = content.length ? Math.max(...content.map((t) => lens[t] ?? 0.6)) : 0.6
  const penalty = filler.length ? Math.min(...filler.map((t) => lens[t] ?? 0.3)) : 1
  const aud = seg.tags.reduce((acc, t) => acc * (AUDIENCE_TAG_BIAS[brief.audience][t] ?? 1), 1) *
    (seg.audienceFit?.[brief.audience] ?? 1)
  const purp = seg.tags.reduce((acc, t) => acc * (PURPOSE_TAG_BIAS[brief.purpose][t] ?? 1), 1)
  // Scenes from the analysis backend: importance is how well this scene matches the chosen category.
  const base = seg.categoryScores && !seg.tags.includes('pause')
    ? 0.35 + 0.65 * ((seg.categoryScores[brief.category] ?? 0) / Math.max(sceneMax, 1e-6))
    : seg.importance
  return base * positive * penalty * aud * purp
}

export const fullLength = (s: Segment) => s.end - s.start
export const coreLength = (s: Segment) => (s.core ? s.core.end - s.core.start : fullLength(s))

export const importanceLabel = (score: number): SegmentDecision['importance'] =>
  score >= 0.6 ? 'High' : score >= 0.3 ? 'Medium' : 'Low'

/** Scores normalised to 0..1 against the strongest segment in this video. */
export function scoreAll(video: Video, brief: Brief) {
  const sceneMax = Math.max(0, ...video.segments.filter((s) => s.categoryScores && !s.tags.includes('pause')).map((s) => s.categoryScores![brief.category] ?? 0))
  const raw = video.segments.map((s) => [s.id, scoreSegment(s, brief, sceneMax)] as const)
  const max = Math.max(...raw.map(([, v]) => v), 0.0001)
  return new Map(raw.map(([id, v]) => [id, v / max]))
}

const reqLabel = (id: string) => REQUIREMENTS.find((r) => r.id === id)?.label.toLowerCase() ?? id

/** Which requirement (if any) protects this segment. */
function softProtection(seg: Segment, brief: Brief): string | null {
  if (isFiller(seg)) return null
  const r = brief.requirements
  if (r.includes('keep-examples') && seg.tags.includes('example')) return 'keep-examples'
  if (r.includes('keep-conclusion') && seg.tags.includes('conclusion')) return 'keep-conclusion'
  if (r.includes('keep-warnings') && seg.tags.includes('warning')) return 'keep-warnings'
  if (r.includes('keep-corrections') && seg.tags.includes('correction')) return 'keep-corrections'
  return null
}

/** Locked topics protect the strongest non-filler segment inside each topic. */
function lockedSegments(video: Video, brief: Brief) {
  const out = new Map<string, string>() // segId -> topic name
  for (const topicId of brief.lockedTopics) {
    const topic = video.topics.find((t) => t.id === topicId)
    const best = video.segments
      .filter((s) => s.topics.includes(topicId) && !isFiller(s))
      .sort((a, b) => b.importance - a.importance)[0]
    if (best && topic) out.set(best.id, topic.name)
  }
  return out
}

function forcedRemoval(seg: Segment, brief: Brief): string | null {
  const r = brief.requirements
  if (seg.repeats && (r.includes('remove-repetition') || seg.tags.includes('repetition'))) return 'repeat'
  if (seg.tags.includes('tangent') && r.includes('remove-tangents')) return 'tangent'
  if ((seg.tags.includes('pause') || seg.tags.includes('noise')) && seg.importance === 0) return 'dead-air'
  return null
}

export function planEdit(video: Video, brief: Brief, overrides: Overrides = {}): EditPlan {
  const steps: AgentStep[] = []
  const step = (label: string, detail: string, status: AgentStep['status'] = 'done') =>
    steps.push({ id: `st${steps.length + 1}`, label, detail, status })

  const lens = categoryById(brief.category)
  const audience = AUDIENCES.find((a) => a.id === brief.audience)!
  const purpose = PURPOSES.find((p) => p.id === brief.purpose)!
  const target = brief.targetSeconds
  const seg = (id: string) => video.segments.find((s) => s.id === id)!

  // 1. Understand the request
  const asks = [
    purpose.label,
    brief.audience === 'custom' && brief.customAudience ? brief.customAudience : `${audience.label} audience`,
    `target ${human(target)}`,
    ...brief.requirements.map(reqLabel),
    ...brief.lockedTopics.map((t) => `keep "${video.topics.find((x) => x.id === t)?.name}"`),
  ]
  step('Understand the request', asks.join('; '))

  // 2–3. Inspect analysis and intent
  const speakers = new Set(video.segments.map((s) => s.speaker).filter(Boolean)).size
  step('Inspect the video analysis', `${video.segments.length} scenes over ${human(video.duration)}${speakers ? `, ${speakers} speakers` : ''}${video.languages.length ? `, ${video.languages.map((l) => l.name).join(' + ')}` : ''}. ${video.speakers.length ? '' : 'No transcript yet, so decisions use visual analysis only.'}`.trim())
  step('Anchor on creator intent', video.intent || 'No intent given. Ranking by how well each scene fits the category.')

  // 4–6. Category lens and ranking
  step('Apply category strategy', `${lens.label} lens: looking for ${lens.looksFor.slice(0, 4).join(', ').toLowerCase()}.`)
  const scores = scoreAll(video, brief)
  const ranked = [...video.segments].sort((a, b) => scores.get(b.id)! - scores.get(a.id)!)
  step('Rank segments by importance', `Top: ${ranked.slice(0, 3).map((s) => `${s.title} (${scores.get(s.id)!.toFixed(2)})`).join(', ')}.`)

  const repeats = video.segments.filter((s) => s.repeats).length
  const tangents = video.segments.filter((s) => s.tags.includes('tangent')).length
  const dead = video.segments.filter((s) => (s.tags.includes('pause') || s.tags.includes('noise')) && s.importance === 0).length
  const mistakes = video.segments.filter((s) => s.tags.includes('mistake')).length
  step('Find repetition, tangents and dead air', `${repeats} repeat${repeats === 1 ? '' : 's'}, ${tangents} tangent${tangents === 1 ? '' : 's'}, ${dead} stretch${dead === 1 ? '' : 'es'} of silence or noise, ${mistakes} self-corrected mistake${mistakes === 1 ? '' : 's'}.`)

  // 7. Protection
  const hard = new Map<string, string>() // segId -> why
  for (const [id, o] of Object.entries(overrides)) if (o === 'protect' || o === 'keep') hard.set(id, o === 'protect' ? 'You protected this segment.' : 'You restored this segment.')
  for (const [id, topic] of lockedSegments(video, brief)) if (!hard.has(id)) hard.set(id, `You asked to keep ${topic.toLowerCase()}.`)
  const soft = new Map<string, string>()
  for (const s of video.segments) {
    if (hard.has(s.id) || overrides[s.id] === 'remove') continue
    const p = softProtection(s, brief)
    if (p) soft.set(s.id, p)
  }
  step('Protect what must stay', hard.size + soft.size
    ? `${hard.size + soft.size} segment${hard.size + soft.size === 1 ? '' : 's'} protected: ${[...hard.keys(), ...soft.keys()].map((id) => seg(id).title).join(', ')}.`
    : 'No explicit protections; relying on ranking.')

  // 8. Draft the Edit Decision List
  const sel: Selection = new Map() // segId -> 'core' | 'full'
  const removedWhy = new Map<string, string>()
  const total = () => [...sel].reduce((a, [id, m]) => a + (m === 'core' ? coreLength(seg(id)) : fullLength(seg(id))), 0)
  const tight = target < video.duration * 0.25

  for (const id of hard.keys()) sel.set(id, tight ? 'core' : 'full')
  const softOrder = [...soft.keys()].sort((a, b) => scores.get(b)! - scores.get(a)!)
  const dropped: string[] = []
  for (const id of softOrder) {
    if (total() + coreLength(seg(id)) <= target * 1.12 || total() === 0) sel.set(id, 'core')
    else dropped.push(id)
  }
  if (dropped.length) {
    const label = reqLabel(soft.get(dropped[0])!)
    step('Resolve conflicting constraints', `"${label}" needs ${human(softOrder.reduce((a, id) => a + coreLength(seg(id)), 0) + [...hard.keys()].reduce((a, id) => a + coreLength(seg(id)), 0))}, more than ${human(target)}. Your newest instruction wins; ${dropped.map((id) => seg(id).title).join(', ')} moved to normal priority.`, 'warn')
    for (const id of dropped) soft.delete(id)
  }

  for (const s of ranked) {
    if (sel.has(s.id)) continue
    if (overrides[s.id] === 'remove') { removedWhy.set(s.id, 'You removed this segment.'); continue }
    const fr = forcedRemoval(s, brief)
    if (fr === 'repeat') { const o = seg(s.repeats!); removedWhy.set(s.id, `Repeats "${o.title}" from ${tc(o.start)} and adds no new information.`); continue }
    if (fr === 'tangent') { removedWhy.set(s.id, `Off-topic aside. It doesn't serve the intent: "${video.intent}"`); continue }
    if (fr === 'dead-air') { removedWhy.set(s.id, `${human(fullLength(s))} of ${s.categoryScores ? 'dark or blank picture' : 'silence or background noise, with no speech worth keeping'}.`); continue }
    const sc = scores.get(s.id)!
    if (sc < 0.2) {
      removedWhy.set(s.id, lowValueReason(s, brief, sc))
      continue
    }
    const cost = tight ? coreLength(s) : fullLength(s)
    if (total() + cost <= target * 1.08) sel.set(s.id, tight && s.core ? 'core' : 'full')
    else if (total() + coreLength(s) <= target * 1.08) sel.set(s.id, 'core')
    else removedWhy.set(s.id, `Worth keeping, but ranked below what fits in ${human(target)} (score ${sc.toFixed(2)}).`)
  }
  // Upgrade trimmed segments to full length while there is room.
  for (const s of ranked) {
    if (sel.get(s.id) !== 'core') continue
    if (total() - coreLength(s) + fullLength(s) <= target) sel.set(s.id, 'full')
  }
  step('Draft the Edit Decision List', `${sel.size} of ${video.segments.length} segments, ${human(total())} before safety checks.`)

  // 9–13. ContextGuard, with re-planning until stable and on target
  let replans = 0
  const contextAdded = new Map<string, string>()
  const issueLog = new Map<string, GuardIssue>()
  const guardRun = () => {
    const g = runContextGuard(video, sel, overrides, hard, removedWhy, target)
    for (const [k, v] of g.addedForContext) contextAdded.set(k, v)
    for (const i of g.issues) issueLog.set(i.id, i)
    return g
  }
  let guard = guardRun()
  step('Run ContextGuard', `Checked ${guard.checked} cuts and ${guard.links} context links. ${guard.issues.length ? `${guard.issues.length} problem${guard.issues.length === 1 ? '' : 's'} found.` : 'No problems found.'}`, guard.issues.length ? 'warn' : 'done')
  for (const i of guard.issues) {
    const label = i.resolution !== 'auto-fixed'
      ? 'Flag for creator review'
      : i.kind === 'meaning-change' ? 'Reject unsafe cut' : i.kind === 'removed-correction' ? 'Restore a correction' : 'Restore missing context'
    step(label, `${i.title}. ${i.resolutionNote}`, i.resolution === 'auto-fixed' ? 'retry' : 'warn')
  }

  const out = () => guard.outputSeconds
  while (out() > target * 1.15 && replans < 4) {
    // Drop the lowest-ranked unprotected segment that nothing kept depends on.
    const victim = [...sel.keys()]
      .filter((id) => !hard.has(id) && !soft.has(id))
      .filter((id) => ![...sel.keys()].some((k) => seg(k).dependsOn?.includes(id) || seg(k).corrects === id))
      .sort((a, b) => scores.get(a)! - scores.get(b)!)[0]
    if (!victim) break
    replans++
    sel.delete(victim)
    removedWhy.set(victim, `Cut on re-plan to get closer to ${human(target)} (lowest ranked kept segment, score ${scores.get(victim)!.toFixed(2)}).`)
    guard = guardRun()
    step('Re-plan for duration', `${human(out())} is over ${human(target)}. Dropped "${seg(victim).title}" and re-ran ContextGuard.`, 'retry')
  }

  const hit = out() <= target * 1.15
  step('Check target duration', hit
    ? `${tc(out())} against a ${tc(target)} target.`
    : `${tc(out())} against a ${tc(target)} target. Everything left is protected or needed for context, so I kept meaning over length.`, hit ? 'done' : 'warn')

  // Build per-segment decisions
  // Keep issues whose segment is still in the edit (or that need review).
  const allIssues = [...issueLog.values()].filter((i) => sel.has(i.segmentId) || i.resolution === 'needs-review' || i.kind !== 'meaning-change')
  const decisions: SegmentDecision[] = video.segments.map((s) => {
    const sc = scores.get(s.id)!
    const issues = allIssues.filter((i) => i.segmentId === s.id || i.relatedId === s.id)
    const needsReview = allIssues.some((i) => i.segmentId === s.id && i.resolution === 'needs-review')
    const kept = sel.has(s.id)
    const mode = sel.get(s.id)
    const keptSeconds = kept ? Math.max(0, (mode === 'core' ? coreLength(s) : fullLength(s)) - guard.savedBySegment(s.id)) : 0
    let decision: SegmentDecision['decision'] = kept ? ((hard.has(s.id) && overrides[s.id] !== 'keep') || soft.has(s.id) ? 'protected' : 'keep') : 'remove'
    if (needsReview) decision = 'risk'
    let reason: string
    if (needsReview) reason = issues.find((i) => i.resolution === 'needs-review')!.detail
    else if (!kept) reason = removedWhy.get(s.id) ?? `Not needed for this version (score ${sc.toFixed(2)}).`
    else if (hard.has(s.id)) reason = hard.get(s.id)! + (mode === 'core' ? ` Trimmed to the essential ${human(coreLength(s))}.` : '')
    else if (soft.has(s.id)) reason = `Protected because you asked to ${reqLabel(soft.get(s.id)!)}.` + (mode === 'core' ? ` Trimmed to the essential ${human(coreLength(s))} of ${human(fullLength(s))}.` : '')
    else if (contextAdded.has(s.id)) reason = contextAdded.get(s.id)!
    else reason = keepReason(s, brief, sc, mode === 'core')
    const risk: SegmentDecision['contextRisk'] = issues.some((i) => i.severity === 'high')
      ? 'High'
      : issues.length || s.dependsOn || s.corrects || s.innerCuts?.some((c) => c.meaningChange)
        ? 'Medium'
        : 'Low'
    return {
      segmentId: s.id,
      decision,
      reason,
      importance: importanceLabel(sc),
      score: sc,
      contextRisk: risk,
      keptSeconds,
      trimmedToCore: mode === 'core' && !!s.core,
      appliedCuts: kept ? guard.appliedCuts.filter((c) => s.innerCuts?.some((x) => x.id === c)) : [],
      rejectedCuts: kept ? guard.rejectedCuts.filter((c) => s.innerCuts?.some((x) => x.id === c)) : [],
      source: overrides[s.id] ? 'creator' : 'agent',
    }
  })

  step('Present the edit for review', `${decisions.filter((d) => d.decision !== 'remove').length} segments kept, ${decisions.filter((d) => d.decision === 'remove').length} cut, ${decisions.filter((d) => d.decision === 'risk').length} need your eyes.`)

  return { decisions, issues: allIssues, steps, outputSeconds: out(), hitTarget: hit, replans }
}

function lowValueReason(s: Segment, brief: Brief, sc: number) {
  if (s.categoryScores) {
    return `Looks least like ${categoryById(brief.category).label.toLowerCase()} footage (${Math.round((s.categoryScores[brief.category] ?? 0) * 100)}% visual match, score ${sc.toFixed(2)}).`
  }
  if (s.tags.includes('logistics')) return 'Housekeeping that only matters to people in the room.'
  if (s.tags.includes('tangent')) return 'Off-topic aside with little value for this audience.'
  if (s.tags.includes('mistake')) {
    return 'The speaker corrects this explanation later. Keeping only the correction avoids teaching the wrong reason.'
  }
  if (s.tags.includes('advanced') && (AUDIENCE_TAG_BIAS[brief.audience].advanced ?? 1) < 0.7) {
    return 'Advanced material. This audience is better served by the fundamentals.'
  }
  if (s.tags.includes('intro')) return 'Set-up talk. The edit opens straight on the first idea instead.'
  return `Low value for this version (score ${sc.toFixed(2)}).`
}

function keepReason(s: Segment, brief: Brief, sc: number, trimmed: boolean) {
  const lens = categoryById(brief.category)
  if (s.categoryScores) {
    const match = Math.round((s.categoryScores[brief.category] ?? 0) * 100)
    return `One of the scenes that looks most like ${lens.label.toLowerCase()} footage (${match}% visual match, score ${sc.toFixed(2)}).`
  }
  const best = s.tags
    .filter((t) => !FILLER_TAGS.includes(t))
    .sort((a, b) => (lens.weights[b] ?? 0.6) - (lens.weights[a] ?? 0.6))[0]
  const what = best ? best.replace('-', ' ') : 'content'
  const trim = trimmed && s.core ? ` Trimmed to ${human(coreLength(s))} of ${human(fullLength(s))}.` : ''
  const article = /^[aeiou]/.test(what) ? 'an' : 'a'
  return `${lens.label} lens ranks this ${importanceLabel(sc).toLowerCase()} as ${article} ${what} (score ${sc.toFixed(2)}).${trim}`
}
