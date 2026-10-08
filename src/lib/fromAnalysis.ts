import type { AnalysisResult, CategoryId, Segment, Video } from '../types'

/**
 * Turn a real analysis into pipeline input. Segments are the detected scenes;
 * their importance comes from how well each scene matches the chosen category.
 * Nothing here is invented: no transcript exists yet, so segments carry no text.
 */
export function videoFromAnalysis(r: AnalysisResult, videoUrl: string | null): Video {
  const segments: Segment[] = r.scenes.map((sc) => {
    const id = `sc${sc.index}`
    const dark = sc.dark
    const dup = sc.duplicate_of !== null ? `sc${sc.duplicate_of}` : undefined
    return {
      id,
      start: sc.start,
      end: sc.end,
      speaker: '',
      lang: [],
      title: `Scene ${sc.index + 1}${dark ? ' (dark or blank)' : dup ? ' (looks like an earlier scene)' : ''}`,
      text: '',
      tags: dark ? ['pause'] : dup ? ['repetition'] : [],
      importance: dark ? 0 : Math.max(...Object.values(sc.scores).map(Number), 0),
      topics: [],
      repeats: dup,
      keyframeUrl: sc.keyframe_url,
      categoryScores: sc.scores,
    }
  })
  return {
    id: r.video_id,
    title: r.metadata.file_name.replace(/\.[^.]+$/, ''),
    fileName: r.metadata.file_name,
    duration: r.metadata.duration,
    detectedCategory: r.predicted_category,
    categoryConfidence: r.confidence,
    alternatives: r.alternatives.filter((a) => a.category !== r.predicted_category).map((a) => ({ id: a.category, confidence: a.confidence })),
    intent: '',
    speakers: [],
    languages: [],
    topics: [],
    segments,
    videoUrl,
    posterUrl: r.scenes[0]?.keyframe_url ?? r.evidence[0]?.frame_url ?? null,
    analysis: r,
  }
}

/** Example instruction for the brief, by category. UI copy only, not analysis. */
export function exampleInstruction(category: CategoryId) {
  if (category === 'sports' || category === 'gaming') return 'Make 60-second highlights for Instagram.'
  if (['travel', 'vlog', 'food', 'entertainment'].includes(category)) return 'Turn this into a 60-second reel for my followers.'
  return 'Make this a 3-minute summary for beginners. Remove repetition.'
}
