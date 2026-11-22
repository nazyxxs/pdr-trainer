// Прогрес зберігається в localStorage браузера (працює і без інтернету).
// Якщо увійти в акаунт, src/sync.js синхронізує його з сервером (Supabase).
import { useSyncExternalStore } from 'react'

const KEY = 'pdr-progress-v1'

const empty = () => ({
  q: {}, // id питання -> { c: правильних, w: помилок, last: 1|0, t: час }
  exams: [], // { t, correct, total, passed, seconds, cat }
  settings: { category: 'B', theme: 'auto' },
  settingsT: 0, // коли востаннє змінювали налаштування
  resetAt: 0, // коли прогрес скидали (щоб скидання теж синхронізувалось)
})

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    if (raw && raw.q) return { ...empty(), ...raw, settings: { ...empty().settings, ...raw.settings } }
  } catch {
    /* пошкоджені дані - починаємо з нуля */
  }
  return empty()
}

let state = load()
const listeners = new Set()

function save(next) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* приватний режим або переповнене сховище */
  }
  listeners.forEach((l) => l())
}

// Об'єднує два стани прогресу: для кожного питання береться новіший запис,
// іспити об'єднуються, налаштування - ті, що змінені пізніше.
export function mergeStates(a, b) {
  const resetAt = Math.max(a.resetAt || 0, b.resetAt || 0)
  const q = {}
  for (const src of [a.q || {}, b.q || {}]) {
    for (const [id, r] of Object.entries(src)) {
      if ((r.t || 0) <= resetAt) continue
      if (!q[id] || (r.t || 0) > (q[id].t || 0)) q[id] = r
    }
  }
  const byT = new Map()
  for (const e of [...(a.exams || []), ...(b.exams || [])]) if (e.t > resetAt) byT.set(e.t, e)
  const exams = [...byT.values()].sort((x, y) => y.t - x.t).slice(0, 200)
  const newer = (b.settingsT || 0) > (a.settingsT || 0) ? b : a
  return {
    q,
    exams,
    settings: { ...empty().settings, ...newer.settings },
    settingsT: Math.max(a.settingsT || 0, b.settingsT || 0),
    resetAt,
  }
}

export const store = {
  get: () => state,
  subscribe(l) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  answer(id, isCorrect) {
    const prev = state.q[id] || { c: 0, w: 0 }
    save({
      ...state,
      q: { ...state.q, [id]: { c: prev.c + (isCorrect ? 1 : 0), w: prev.w + (isCorrect ? 0 : 1), last: isCorrect ? 1 : 0, t: Date.now() } },
    })
  },
  addExam(result) {
    save({ ...state, exams: [result, ...state.exams].slice(0, 200) })
  },
  setSettings(patch) {
    save({ ...state, settings: { ...state.settings, ...patch }, settingsT: Date.now() })
  },
  reset() {
    save({ ...empty(), settings: state.settings, settingsT: state.settingsT, resetAt: Date.now() })
  },
  // злиття з іншим станом (з сервера або з файлу)
  merge(other) {
    if (!other || typeof other.q !== 'object') throw new Error('Невірний формат')
    const next = mergeStates(state, other)
    if (JSON.stringify(next) !== JSON.stringify(state)) save(next)
  },
  export() {
    return JSON.stringify(state)
  },
  import(text) {
    store.merge(JSON.parse(text))
  },
}

export function useStore() {
  return useSyncExternalStore(store.subscribe, store.get)
}

// Статистика по набору питань
export function statsFor(questions, qState) {
  let seen = 0
  let mastered = 0
  let wrong = 0
  for (const q of questions) {
    const r = qState[q.id]
    if (!r) continue
    seen++
    if (r.last === 1) mastered++
    else wrong++
  }
  const total = questions.length
  return { total, seen, mastered, wrong, pct: total ? Math.round((mastered / total) * 100) : 0, seenPct: total ? Math.round((seen / total) * 100) : 0 }
}
