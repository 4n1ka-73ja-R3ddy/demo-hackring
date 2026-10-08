import type { SegmentDecision, Segment, Version, Video } from '../types'

/** What the viewer will actually hear for a segment in this version. */
export function spokenText(seg: Segment, d?: SegmentDecision) {
  let text = d?.trimmedToCore && seg.core ? seg.core.text : seg.text
  for (const c of seg.innerCuts ?? []) {
    if (d?.rejectedCuts.includes(c.id) && c.safeAlternative) text = text.replace(c.before, c.safeAlternative)
    else if (d?.appliedCuts.includes(c.id)) text = text.replace(c.before, c.after)
  }
  return text
}

export interface OutputClip { seg: Segment; d: SegmentDecision; outStart: number; outEnd: number }

/** Kept segments in source order with their position in the edited output. */
export function outputClips(video: Video, version: Version): OutputClip[] {
  let t = 0
  const clips: OutputClip[] = []
  for (const seg of video.segments) {
    const d = version.plan.decisions.find((x) => x.segmentId === seg.id)!
    if (d.decision === 'remove' || d.keptSeconds <= 0) continue
    clips.push({ seg, d, outStart: t, outEnd: t + d.keptSeconds })
    t += d.keptSeconds
  }
  return clips
}

/** The Edit Decision List the backend will hand to FFmpeg. */
export function toEDL(video: Video, version: Version) {
  return {
    source: video.fileName,
    version: version.name,
    brief: version.brief,
    outputSeconds: version.plan.outputSeconds,
    clips: outputClips(video, version).map(({ seg, d }) => ({
      segment: seg.id,
      in: d.trimmedToCore && seg.core ? seg.core.start : seg.start,
      out: d.trimmedToCore && seg.core ? seg.core.end : seg.end,
      decision: d.decision,
      innerCutsApplied: d.appliedCuts,
      innerCutsRejected: d.rejectedCuts,
      reason: d.reason,
    })),
    contextGuard: version.plan.issues.map((i) => ({ kind: i.kind, segment: i.segmentId, resolution: i.resolution, note: i.resolutionNote })),
  }
}
