// Natural-language instruction parsing (mock). The backend will hand the
// instruction to the LLM; this keyword parser gives the prototype the same
// shape of result: a partial Brief plus what the agent understood.

import type { AudienceId, Brief, PurposeId, RequirementId, Video } from '../types'

const NUM_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, ninety: 90, half: 0.5,
}

export interface ParsedInstruction {
  patch: Partial<Brief>
  addRequirements: RequirementId[]
  lockTopics: string[]
  understood: string[]
}

export function parseDuration(text: string): number | null {
  const t = text.toLowerCase()
  if (/half (a|an) minute/.test(t)) return 30
  const m = t.match(/(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|ninety|half)[\s-]*(hours?|hrs?|minutes?|mins?|m\b|seconds?|secs?|s\b)/)
  if (!m) return null
  const n = isNaN(Number(m[1])) ? NUM_WORDS[m[1]] : Number(m[1])
  if (!n) return null
  const unit = m[2]
  if (unit.startsWith('h')) return n * 3600
  if (unit.startsWith('m')) return Math.round(n * 60)
  return Math.round(n)
}

const AUDIENCE_WORDS: [RegExp, AudienceId][] = [
  [/\bbeginners?\b|\bnewbies?\b|\bfirst[- ]time/, 'beginner'],
  [/\bstudents?\b|\bexam\b/, 'student'],
  [/\bprofessionals?\b|\bexperts?\b|\bengineers?\b|\bdevelopers?\b/, 'professional'],
  [/\bkids\b|\bchildren\b/, 'children'],
  [/\bfollowers\b|\bsubscribers\b|\bmy audience\b/, 'followers'],
  [/\beveryone\b|\bgeneral\b/, 'general'],
]

const PURPOSE_WORDS: [RegExp, PurposeId][] = [
  [/\brevision\b|\brevise\b|\bexam prep\b|\brecap\b/, 'revision'],
  [/\breel\b|\bshorts?\b|\binstagram\b|\btiktok\b|\bsocial\b/, 'short'],
  [/\bhighlights?\b|\bbest moments\b/, 'highlights'],
  [/\bsummary\b|\bsummari[sz]e\b/, 'summary'],
  [/\btrailer\b|\bteaser\b/, 'trailer'],
  [/\bpromo\b|\bpromotional\b|\bad\b/, 'promo'],
  [/\bfull (edited )?video\b|\bclean (it )?up\b|\blesson\b/, 'full'],
]

const KEEP_VERB = /\b(keep|don'?t (remove|cut|drop|lose)|do not (remove|cut|drop)|never (remove|cut)|preserve|must have|include|retain)\b/

export function parseInstruction(text: string, video: Video): ParsedInstruction {
  const t = text.toLowerCase()
  const patch: Partial<Brief> = {}
  const understood: string[] = []
  const addRequirements: RequirementId[] = []
  const lockTopics: string[] = []

  const d = parseDuration(t)
  if (d) { patch.targetSeconds = d; understood.push(`about ${d >= 60 ? `${+(d / 60).toFixed(1)} min` : `${d} sec`}`) }

  for (const [re, id] of AUDIENCE_WORDS) if (re.test(t)) { patch.audience = id; understood.push(`for ${id === 'followers' ? 'existing followers' : id + 's'}`.replace('generals', 'a general audience').replace('childrens', 'children')); break }
  for (const [re, id] of PURPOSE_WORDS) if (re.test(t)) { patch.purpose = id; understood.push(id === 'short' ? 'as a short / reel' : `as a ${id === 'full' ? 'full edit' : id}`); break }

  const keep = KEEP_VERB.test(t)
  if (keep && /\b(all|every)\b[^.]*\bexamples?\b/.test(t)) { addRequirements.push('keep-examples'); understood.push('keep all examples') }
  if (keep && /\bconclusion\b|\bending\b|\bverdict\b/.test(t)) { addRequirements.push('keep-conclusion'); understood.push('keep the conclusion') }
  if (keep && /\bwarnings?\b/.test(t)) { addRequirements.push('keep-warnings'); understood.push('keep warnings') }
  if (keep && /\bcorrections?\b/.test(t)) { addRequirements.push('keep-corrections'); understood.push('keep corrections') }
  if (/\b(remove|cut|drop|no)\b[^.]*\b(repetition|repeats?|repeated)\b/.test(t)) { addRequirements.push('remove-repetition'); understood.push('remove repetition') }
  if (/\b(remove|cut|drop|skip|no)\b[^.]*\btangents?\b/.test(t)) { addRequirements.push('remove-tangents'); understood.push('remove tangents') }
  if (/\bpauses?\b|\bsilence\b|\bdead air\b/.test(t)) { addRequirements.push('remove-pauses'); understood.push('remove long pauses') }

  if (keep) {
    for (const topic of video.topics) {
      const hit = topic.aliases.some((a) => t.includes(a))
      if (hit && !lockTopics.includes(topic.id)) { lockTopics.push(topic.id); understood.push(`keep ${topic.name.toLowerCase()}`) }
    }
  }

  return { patch, addRequirements, lockTopics, understood }
}

export function applyInstruction(brief: Brief, parsed: ParsedInstruction, instruction: string): Brief {
  return {
    ...brief,
    ...parsed.patch,
    requirements: [...new Set([...brief.requirements, ...parsed.addRequirements])],
    lockedTopics: [...new Set([...brief.lockedTopics, ...parsed.lockTopics])],
    instruction,
  }
}

/** Find the segment a creator is talking about ("the college story", "the ORM question"). */
export function matchSegment(text: string, video: Video) {
  const byNumber = text.toLowerCase().match(/\bscene\s*#?\s*(\d+)/)
  if (byNumber) return video.segments.find((s) => s.title.toLowerCase().match(/^scene (\d+)\b/)?.[1] === byNumber[1]) ?? null
  const stop = new Set(['the', 'this', 'that', 'why', 'did', 'you', 'cut', 'remove', 'restore', 'keep', 'back', 'bring', 'protect', 'about', 'with', 'part', 'segment', 'bit', 'what', 'and', 'from', 'put'])
  const words = text.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !stop.has(w))
  let best: { id: string; score: number } | null = null
  for (const s of video.segments) {
    const hay = `${s.title} ${s.text} ${s.tags.join(' ')} ${s.topics.map((id) => video.topics.find((t) => t.id === id)?.aliases.join(' ')).join(' ')}`.toLowerCase()
    const titleHay = s.title.toLowerCase()
    const score = words.reduce((a, w) => a + (titleHay.includes(w) ? 2 : hay.includes(w) ? 1 : 0), 0)
    if (score > 0 && (!best || score > best.score)) best = { id: s.id, score }
  }
  return best && best.score >= 2 ? video.segments.find((s) => s.id === best!.id)! : null
}
