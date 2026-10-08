export const tc = (sec: number) => {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const mm = h ? String(m).padStart(2, '0') : String(m).padStart(2, '0')
  return (h ? `${h}:` : '') + `${mm}:${String(r).padStart(2, '0')}`
}

/** "3 min", "45 sec", "1 min 20 sec" */
export const human = (sec: number) => {
  const s = Math.round(sec)
  if (s < 60) return `${s} sec`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r ? `${m} min ${r} sec` : `${m} min`
}

export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}`

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
