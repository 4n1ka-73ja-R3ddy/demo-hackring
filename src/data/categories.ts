import type { AudienceId, CategoryId, PurposeId, RequirementId, Tag } from '../types'

export interface CategoryStrategy {
  id: CategoryId
  label: string
  /** What this lens looks for, shown to the creator */
  looksFor: string[]
  /** Tag weights used by the planner. Missing tags default to 0.6. */
  weights: Partial<Record<Tag, number>>
}

const filler: Partial<Record<Tag, number>> = {
  repetition: 0.15,
  tangent: 0.2,
  pause: 0,
  noise: 0.05,
  logistics: 0.15,
  mistake: 0.1,
}

export const CATEGORIES: CategoryStrategy[] = [
  {
    id: 'education',
    label: 'Education',
    looksFor: ['Concepts', 'Definitions', 'Formulas', 'Examples', 'Explanations', 'Demonstrations', 'Corrections', 'Conclusions'],
    weights: { ...filler, definition: 1.3, concept: 1.2, example: 1.25, demonstration: 1.2, explanation: 1, warning: 1.15, correction: 1.2, conclusion: 1.1, question: 0.9, answer: 1, advanced: 0.8, intro: 0.6 },
  },
  {
    id: 'sports',
    label: 'Sports',
    looksFor: ['Goals and points', 'Key plays', 'Saves', 'Fouls', 'Near misses', 'Celebrations', 'High-intensity moments'],
    weights: { ...filler, goal: 1.5, 'key-play': 1.25, save: 1.2, foul: 0.9, 'near-miss': 1.05, celebration: 1, 'build-up': 0.7, reaction: 0.8 },
  },
  {
    id: 'vlog',
    label: 'Vlog',
    looksFor: ['Story progression', 'Experiences', 'Reactions', 'Funny moments', 'Emotional moments', 'Location changes'],
    weights: { ...filler, story: 1.2, experience: 1.15, reaction: 1.1, funny: 1.15, emotional: 1.2, location: 1, scenic: 0.9 },
  },
  {
    id: 'food',
    label: 'Food / Cooking',
    looksFor: ['Ingredients', 'Preparation', 'Key cooking steps', 'Techniques', 'Final dish', 'Reactions'],
    weights: { ...filler, demonstration: 1.3, explanation: 1, reaction: 0.9, warning: 1.1, conclusion: 1.1 },
  },
  {
    id: 'podcast',
    label: 'Podcast',
    looksFor: ['Key discussions', 'Opinions', 'Stories', 'Questions and answers', 'Memorable statements'],
    weights: { ...filler, story: 1.2, question: 1.05, answer: 1.15, funny: 1, explanation: 1 },
  },
  {
    id: 'interview',
    label: 'Interview',
    looksFor: ['Questions', 'Answers', 'Claims', 'Explanations', 'Context around statements'],
    weights: { ...filler, question: 1.2, answer: 1.3, explanation: 1.05, correction: 1.2 },
  },
  {
    id: 'travel',
    label: 'Travel',
    looksFor: ['Locations', 'Experiences', 'Scenic moments', 'Recommendations', 'Reactions'],
    weights: { ...filler, location: 1.2, experience: 1.15, scenic: 1.15, recommendation: 1.3, reaction: 1, story: 0.95, funny: 0.95, emotional: 1 },
  },
  {
    id: 'gaming',
    label: 'Gaming',
    looksFor: ['Wins', 'Fights', 'Achievements', 'Failures', 'Funny moments', 'High-intensity gameplay'],
    weights: { ...filler, goal: 1.3, 'key-play': 1.2, funny: 1.1, reaction: 1, 'near-miss': 1.05 },
  },
  {
    id: 'product',
    label: 'Product / Review',
    looksFor: ['Features', 'Demonstrations', 'Advantages', 'Disadvantages', 'Comparisons', 'Final verdict'],
    weights: { ...filler, demonstration: 1.25, explanation: 1, conclusion: 1.3, warning: 1.1 },
  },
  {
    id: 'business',
    label: 'Business',
    looksFor: ['Key messages', 'Product walkthroughs', 'Metrics', 'Calls to action', 'Customer stories'],
    weights: { ...filler, demonstration: 1.2, story: 1.05, conclusion: 1.2, explanation: 1 },
  },
  {
    id: 'entertainment',
    label: 'Entertainment',
    looksFor: ['Funny moments', 'Reactions', 'Story beats', 'Surprises', 'Memorable lines'],
    weights: { ...filler, funny: 1.3, reaction: 1.15, story: 1.1, emotional: 1.1 },
  },
  {
    id: 'other',
    label: 'Other',
    looksFor: ['Main points', 'Memorable moments', 'Conclusions'],
    weights: { ...filler },
  },
]

export const categoryById = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!

export const AUDIENCES: { id: AudienceId; label: string; hint: string }[] = [
  { id: 'general', label: 'General', hint: 'No prior knowledge assumed, broad appeal' },
  { id: 'beginner', label: 'Beginner', hint: 'Keeps foundations and worked examples' },
  { id: 'student', label: 'Student', hint: 'Dense, exam-relevant, fewer stories' },
  { id: 'professional', label: 'Professional', hint: 'Skips basics, keeps depth and edge cases' },
  { id: 'children', label: 'Children', hint: 'Simple, visual, short attention span' },
  { id: 'followers', label: 'Existing followers', hint: 'Personality and callbacks stay in' },
  { id: 'custom', label: 'Custom', hint: 'Describe your audience' },
]

export const PURPOSES: { id: PurposeId; label: string; hint: string }[] = [
  { id: 'full', label: 'Full edited video', hint: 'Clean up, keep the whole arc' },
  { id: 'summary', label: 'Summary', hint: 'Every key point, briefly' },
  { id: 'highlights', label: 'Highlights', hint: 'Best moments only' },
  { id: 'revision', label: 'Revision', hint: 'Definitions, examples, takeaways' },
  { id: 'short', label: 'Short / Reel', hint: 'One idea, strong hook' },
  { id: 'trailer', label: 'Trailer', hint: 'Tease without giving it away' },
  { id: 'promo', label: 'Promotional', hint: 'Lead with value, end with a call to action' },
  { id: 'custom', label: 'Custom', hint: 'Describe the format' },
]

export const DURATIONS: { seconds: number; label: string }[] = [
  { seconds: 30, label: '30 sec' },
  { seconds: 60, label: '60 sec' },
  { seconds: 180, label: '3 min' },
  { seconds: 300, label: '5 min' },
  { seconds: 600, label: '10 min' },
]

export const REQUIREMENTS: { id: RequirementId; label: string }[] = [
  { id: 'keep-examples', label: 'Keep all examples' },
  { id: 'keep-conclusion', label: 'Never remove the conclusion' },
  { id: 'keep-warnings', label: 'Keep important warnings' },
  { id: 'keep-corrections', label: 'Keep corrections' },
  { id: 'remove-repetition', label: 'Remove repetition' },
  { id: 'remove-tangents', label: 'Remove tangents' },
  { id: 'remove-pauses', label: 'Remove long pauses' },
]

/** Audience preferences over tags, layered on top of the category lens. */
export const AUDIENCE_TAG_BIAS: Record<AudienceId, Partial<Record<Tag, number>>> = {
  general: { advanced: 0.7, story: 1.1 },
  beginner: { definition: 1.25, example: 1.2, intro: 1.15, advanced: 0.45, explanation: 1.1, warning: 1.1 },
  student: { definition: 1.2, example: 1.15, conclusion: 1.2, story: 0.6, intro: 0.5, advanced: 0.9 },
  professional: { definition: 0.6, intro: 0.3, advanced: 1.4, warning: 1.15, explanation: 0.9 },
  children: { advanced: 0.2, funny: 1.3, example: 1.1 },
  followers: { story: 1.2, funny: 1.2, reaction: 1.15 },
  custom: {},
}

/** Purpose preferences: what kind of moments a format favours. */
export const PURPOSE_TAG_BIAS: Record<PurposeId, Partial<Record<Tag, number>>> = {
  full: {},
  summary: { definition: 1.1, conclusion: 1.2, example: 0.95 },
  highlights: { goal: 1.3, 'key-play': 1.2, reaction: 1.15, funny: 1.15, explanation: 0.8 },
  revision: { definition: 1.3, example: 1.15, conclusion: 1.25, warning: 1.1, story: 0.4, intro: 0.3, question: 0.7 },
  short: { intro: 0.2, conclusion: 0.8, warning: 1.2, example: 1.2, funny: 1.2, reaction: 1.2, goal: 1.4 },
  trailer: { reaction: 1.2, scenic: 1.2, conclusion: 0.3, goal: 0.8 },
  promo: { conclusion: 1.2, recommendation: 1.2 },
  custom: {},
}
