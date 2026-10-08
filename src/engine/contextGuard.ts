// ContextGuard (mock). Compares what the viewer will hear after the edit with
// what was originally said, and rejects or flags cuts that change meaning.
//
// Checks:
//  - meaning-change     an inner cut drops a negation or qualifier
//  - missing-context    a kept segment depends on one that was cut
//  - orphaned-answer    an answer is kept without its question
//  - removed-correction a mistake is kept but its correction was cut
//
// Auto-fixes when it can (restore context, use a safer cut); otherwise the
// segment is marked CONTEXT RISK for the creator.

import { human, tc } from '../lib/format'
import type { GuardIssue, Overrides, Segment, Video } from '../types'

export type Selection = Map<string, 'core' | 'full'>

const len = (s: Segment, m: 'core' | 'full') => (m === 'core' && s.core ? s.core.end - s.core.start : s.end - s.start)

export function runContextGuard(
  video: Video,
  sel: Selection,
  overrides: Overrides,
  hard: Map<string, string>,
  removedWhy: Map<string, string>,
  target: number,
) {
  const seg = (id: string) => video.segments.find((s) => s.id === id)!
  const issues: GuardIssue[] = []
  const addedForContext = new Map<string, string>()
  const appliedCuts: string[] = []
  const rejectedCuts: string[] = []
  const saved = new Map<string, number>()
  let checked = 0
  let links = 0
  const total = () => [...sel].reduce((a, [id, m]) => a + len(seg(id), m), 0)

  // Context links: dependencies, Q&A and corrections. Iterate until stable,
  // since restoring one segment can pull in another.
  for (let pass = 0; pass < 3; pass++) {
    let changed = false
    for (const id of [...sel.keys()].sort((a, b) => seg(a).start - seg(b).start)) {
      const s = seg(id)
      for (const dep of s.dependsOn ?? []) {
        links++
        if (sel.has(dep)) continue
        const d = seg(dep)
        const isAnswer = s.tags.includes('answer')
        const kind = isAnswer ? 'orphaned-answer' : 'missing-context'
        const title = isAnswer
          ? `"${s.title}" would play without its question`
          : `"${s.title}" relies on "${d.title}", which was cut`
        if (overrides[dep] === 'remove') {
          issues.push({
            id: `g-${id}-${dep}`, kind, segmentId: id, relatedId: dep, severity: 'high', title,
            detail: `You removed "${d.title}" (${tc(d.start)}), but this segment refers back to it. Viewers will hear ${isAnswer ? 'an answer to a question they never heard' : 'a reference to something they never saw'}.`,
            before: d.core?.text ?? d.text, after: s.core?.text ?? s.text,
            resolution: 'needs-review',
            resolutionNote: 'Restore the context, or remove this segment too.',
          })
          continue
        }
        const room = total() + len(d, 'core') <= target * 1.2 || hard.has(id)
        if (room) {
          sel.set(dep, 'core')
          removedWhy.delete(dep)
          addedForContext.set(dep, `Restored by ContextGuard: "${s.title}" doesn't make sense without it. Trimmed to ${human(len(d, 'core'))}.`)
          issues.push({
            id: `g-${id}-${dep}`, kind, segmentId: id, relatedId: dep, severity: 'medium', title,
            detail: `Restored the essential ${human(len(d, 'core'))} of "${d.title}" so the reference makes sense.`,
            before: d.core?.text ?? d.text, after: s.core?.text ?? s.text,
            resolution: 'auto-fixed',
            resolutionNote: `Restored ${human(len(d, 'core'))} of "${d.title}".`,
          })
        } else {
          sel.delete(id)
          removedWhy.set(id, `ContextGuard removed this: it depends on "${d.title}", which doesn't fit in ${human(target)}. Keeping it alone would be misleading.`)
          issues.push({
            id: `g-${id}-${dep}`, kind, segmentId: id, relatedId: dep, severity: 'medium', title,
            detail: `There was no room for "${d.title}", so this segment was cut too rather than played out of context.`,
            resolution: 'auto-fixed',
            resolutionNote: `Cut "${s.title}" along with its context.`,
          })
        }
        changed = true
      }
    }

    // Corrections: a kept mistake must keep its correction.
    for (const c of video.segments.filter((x) => x.corrects)) {
      links++
      const mistake = seg(c.corrects!)
      if (!sel.has(mistake.id) || sel.has(c.id)) continue
      const title = `"${mistake.title}" is kept but its correction is cut`
      if (overrides[c.id] === 'remove') {
        issues.push({
          id: `g-${mistake.id}-${c.id}`, kind: 'removed-correction', segmentId: mistake.id, relatedId: c.id, severity: 'high', title,
          detail: `At ${tc(c.start)} the speaker corrects this. Without "${c.title}" the edit presents a statement they took back.`,
          before: mistake.text, after: c.core?.text ?? c.text,
          resolution: 'needs-review', resolutionNote: 'Restore the correction, or cut the original statement.',
        })
        continue
      }
      sel.set(c.id, 'core')
      removedWhy.delete(c.id)
      addedForContext.set(c.id, `Restored by ContextGuard: it corrects "${mistake.title}", which is in the edit.`)
      issues.push({
        id: `g-${mistake.id}-${c.id}`, kind: 'removed-correction', segmentId: mistake.id, relatedId: c.id, severity: 'high', title,
        detail: `The speaker takes this back at ${tc(c.start)}. Restored the correction so the edit doesn't present a retracted statement.`,
        before: mistake.core?.text ?? mistake.text, after: c.core?.text ?? c.text,
        resolution: 'auto-fixed', resolutionNote: `Restored "${c.title}".`,
      })
      changed = true
    }
    if (!changed) break
  }

  // Creator kept something whose context they removed is handled above.
  // Inner cuts: compare the sentence before and after each proposed cut.
  for (const id of sel.keys()) {
    const s = seg(id)
    let sv = 0
    for (const cut of s.innerCuts ?? []) {
      checked++
      if (cut.meaningChange) {
        rejectedCuts.push(cut.id)
        const fixed = cut.safeAlternative
        if (fixed) sv += Math.max(1, cut.saves - 1)
        issues.push({
          id: `g-${cut.id}`, kind: 'meaning-change', segmentId: id, cutId: cut.id, severity: 'high',
          title: cut.meaningChange.kind === 'negation' ? `Cut in "${s.title}" removes a negation` : `Cut in "${s.title}" drops a condition`,
          detail: cut.meaningChange.detail,
          before: cut.before, after: cut.after,
          resolution: 'auto-fixed',
          resolutionNote: fixed ? `Used a tighter cut instead: "${fixed}"` : 'Kept the original wording.',
        })
      } else {
        appliedCuts.push(cut.id)
        sv += cut.saves
      }
    }
    saved.set(id, sv)
  }
  // Pauses and filler inside every kept segment, beyond the scripted cuts.
  checked += sel.size * 3

  const outputSeconds = Math.max(0, total() - [...saved.values()].reduce((a, b) => a + b, 0))

  return {
    issues,
    addedForContext,
    appliedCuts,
    rejectedCuts,
    checked,
    links,
    outputSeconds,
    savedBySegment: (id: string) => saved.get(id) ?? 0,
  }
}
