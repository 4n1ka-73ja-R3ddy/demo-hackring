// Mock agent service. Every function here is the seam where the real backend
// plugs in (Agnes 3.0 Flash for reasoning, STT for transcripts, FFmpeg for
// rendering). Components only talk to this module, never to the engine.

import { AUDIENCES, PURPOSES } from '../data/categories'
import { applyInstruction, matchSegment, parseInstruction } from '../engine/instructions'
import { planEdit } from '../engine/planner'
import { human, tc, uid } from '../lib/format'
import type { Brief, ChatMessage, Overrides, Version, Video } from '../types'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function versionName(brief: Brief) {
  const a = brief.audience === 'custom' ? brief.customAudience || 'Custom' : AUDIENCES.find((x) => x.id === brief.audience)!.label
  const p = PURPOSES.find((x) => x.id === brief.purpose)!.label.replace(' / Reel', '')
  return `${a} ${p.toLowerCase()} (${human(brief.targetSeconds)})`
}

export function createVersion(video: Video, brief: Brief, parent: Version | null, overrides: Overrides = {}): Version {
  return {
    id: uid('v'),
    name: versionName(brief),
    parentId: parent?.id ?? null,
    brief,
    overrides,
    plan: planEdit(video, brief, overrides),
    createdAt: Date.now(),
    instruction: brief.instruction,
  }
}

/** Re-plan an existing version after the creator restores, removes or protects a segment. */
export function applyOverride(video: Video, version: Version, segmentId: string, action: 'keep' | 'remove' | 'protect' | 'clear'): Version {
  const overrides = { ...version.overrides }
  if (action === 'clear') delete overrides[segmentId]
  else overrides[segmentId] = action
  return { ...version, overrides, plan: planEdit(video, version.brief, overrides) }
}

export interface ChatResult {
  reply: ChatMessage
  newVersion?: Version
  updatedVersion?: Version
}

const say = (text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: uid('m'), role: 'agent', text, ...extra })

/** Conversational re-editing. Routes a message to: new version, override, or explanation. */
export async function sendMessage(text: string, video: Video, active: Version): Promise<ChatResult> {
  await wait(450)
  const t = text.toLowerCase()
  const parsed = parseInstruction(text, video)
  const changesBrief = parsed.patch.targetSeconds || parsed.patch.audience || parsed.patch.purpose || parsed.addRequirements.length || parsed.lockTopics.length

  // Explanation
  if (/\bwhy\b/.test(t)) {
    const s = matchSegment(text, video)
    if (!s) return { reply: say('Which part do you mean? Name it by number, like "scene 3", or select a segment and press Why.') }
    const d = active.plan.decisions.find((x) => x.segmentId === s.id)!
    const verb = d.decision === 'remove' ? 'cut' : d.decision === 'risk' ? 'flagged' : 'kept'
    return {
      reply: say(`I ${verb} "${s.title}" (${tc(s.start)}–${tc(s.end)}). ${d.reason}`, {
        bullets: [
          `Importance: ${d.importance} (score ${d.score.toFixed(2)})`,
          `Context risk: ${d.contextRisk}`,
          d.decision === 'remove' ? 'Say "restore it" or use Restore to bring it back. I will re-check context.' : 'Say "cut it" or use Remove if you disagree.',
        ],
      }),
    }
  }

  // Direct segment actions (only when the message isn't a new brief)
  const negatedKeep = /\b(don'?t|do not|never)\s+(remove|cut|drop)\b/.test(t)
  const action = /\b(restore|bring back|put back|add back|undo the cut)\b/.test(t)
    ? 'keep'
    : /\bprotect|lock\b/.test(t)
      ? 'protect'
      : !negatedKeep && /\b(cut|remove|drop|delete|lose)\b/.test(t) && !changesBrief
        ? 'remove'
        : null
  if (action && !parsed.patch.targetSeconds) {
    const s = matchSegment(text, video)
    if (s) {
      const updated = applyOverride(video, active, s.id, action)
      const d = updated.plan.decisions.find((x) => x.segmentId === s.id)!
      const newIssues = updated.plan.issues.filter((i) => !active.plan.issues.some((o) => o.id === i.id))
      return {
        updatedVersion: updated,
        reply: say(`${action === 'keep' ? 'Restored' : action === 'protect' ? 'Protected' : 'Removed'} "${s.title}". This version is now ${tc(updated.plan.outputSeconds)}.`, {
          bullets: [
            ...newIssues.map((i) => `ContextGuard: ${i.title}. ${i.resolutionNote}`),
            d.decision === 'risk' ? 'Marked as a context risk for you to review.' : 'ContextGuard re-checked the edit.',
          ],
        }),
      }
    }
  }

  if (changesBrief) {
    const brief = applyInstruction(active.brief, parsed, text)
    const v = createVersion(video, brief, active, active.overrides)
    const p = v.plan
    const carried = [
      ...active.brief.requirements.filter((r) => brief.requirements.includes(r)).length ? ['kept your earlier requirements'] : [],
      ...Object.keys(active.overrides).length ? [`kept your ${Object.keys(active.overrides).length} manual change${Object.keys(active.overrides).length === 1 ? '' : 's'}`] : [],
    ]
    const warn = [
      ...p.steps.filter((s) => s.label === 'Resolve conflicting constraints').map((s) => s.detail),
      ...p.issues.map((i) => `ContextGuard: ${i.title}. ${i.resolutionNote}`),
      ...(p.hitTarget ? [] : [p.steps.find((s) => s.label === 'Check target duration')!.detail]),
    ]
    return {
      newVersion: v,
      reply: say(
        `New version from "${active.name}": ${tc(p.outputSeconds)}${p.hitTarget ? '' : `, over the ${human(brief.targetSeconds)} target`}. I understood ${parsed.understood.join(', ') || 'your change'}${carried.length ? ', and ' + carried.join(' and ') : ''}.`,
        { versionId: v.id, bullets: warn.slice(0, 5) },
      ),
    }
  }

  return {
    reply: say('I can change the length, audience or format ("make it 5 minutes for students"), keep or cut a specific part ("restore scene 3"), or explain a decision ("why did you cut scene 3?").'),
  }
}
