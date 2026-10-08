// Word-level diff used by ContextGuard cards: shows exactly which words a cut removes.

const tokenize = (s: string) => s.split(/(\s+)/).filter((t) => t.length)

function lcs(a: string[], b: string[]) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const keepA = new Set<number>()
  const keepB = new Set<number>()
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { keepA.add(i); keepB.add(j); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return { keepA, keepB }
}

export function WordDiff({ before, after, mode }: { before: string; after: string; mode: 'before' | 'after' }) {
  const a = tokenize(before)
  const b = tokenize(after)
  const { keepA, keepB } = lcs(a, b)
  const toks = mode === 'before' ? a : b
  const keep = mode === 'before' ? keepA : keepB
  return (
    <>
      {toks.map((t, i) =>
        keep.has(i) || /^\s+$/.test(t) ? (
          <span key={i}>{t}</span>
        ) : mode === 'before' ? (
          <del key={i} className="rounded-sm bg-risk-soft px-0.5 text-risk decoration-risk/60">{t}</del>
        ) : (
          <ins key={i} className="rounded-sm bg-keep-soft px-0.5 text-keep no-underline">{t}</ins>
        ),
      )}
    </>
  )
}
