// Прогрес зберігається в localStorage браузера (працює і без інтернету).
// Якщо увійти в акаунт, src/sync.js синхронізує його з сервером (Supabase).
import { useSyncExternalStore } from 'react'

const KEY = 'pdr-progress-v1'

// id пристрою: щоб відповіді за день з телефона і ноутбука додавались, а не перезаписувались
const deviceId = (() => {
  try {
    let id = localStorage.getItem('pdr-device-id')
    if (!id) {
      id = Math.random().toString(36).slice(2, 10)
      localStorage.setItem('pdr-device-id', id)
    }
    return id
  } catch {
    return 'local'
  }
})()

// дата в локальному часовому поясі: '2026-11-23'
const pad = (n) => String(n).padStart(2, '0')
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// приводимо ключі днів до вигляду '2026-11-24' (на випадок іншого формату дати в браузері)
function normDay(k) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return k
  const m = k.match(/(\d{1,4})\D+(\d{1,2})\D+(\d{1,4})/)
  if (!m) return null
  let [, a, b, c] = m.map(Number)
  if (a > 31) return `${a}-${pad(b)}-${pad(c)}` // y-m-d
  if (k.includes('/') && a <= 12 && b > 12) [a, b] = [b, a] // m/d/y
  return `${c}-${pad(b)}-${pad(a)}` // d.m.y
}
function normDays(days) {
  const out = {}
  for (const [k, devs] of Object.entries(days || {})) {
    const nk = normDay(k)
    if (!nk) continue
    out[nk] = out[nk] || {}
    for (const [dev, n] of Object.entries(devs)) out[nk][dev] = Math.max(out[nk][dev] || 0, n)
  }
  return out
}

const empty = () => ({
  q: {}, // id питання -> { c: правильних, w: помилок, last: 1|0, t: час }
  exams: [], // { t, correct, total, passed, seconds, cat }
  settings: { category: 'B', theme: 'auto', dailyGoal: 20 },
  days: {}, // '2026-11-23' -> { idПристрою: кількість відповідей }
  settingsT: 0, // коли востаннє змінювали налаштування
  resetAt: 0, // коли прогрес скидали (щоб скидання теж синхронізувалось)
})

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    if (raw && raw.q) return { ...empty(), ...raw, days: normDays(raw.days), settings: { ...empty().settings, ...raw.settings } }
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
  const resetDay = resetAt ? dayKey(new Date(resetAt)) : ''
  const days = {}
  for (const src of [normDays(a.days), normDays(b.days)]) {
    for (const [day, devs] of Object.entries(src)) {
      if (day < resetDay) continue
      days[day] = days[day] || {}
      for (const [dev, n] of Object.entries(devs)) days[day][dev] = Math.max(days[day][dev] || 0, n)
    }
  }
  return {
    q,
    exams,
    settings: { ...empty().settings, ...newer.settings },
    settingsT: Math.max(a.settingsT || 0, b.settingsT || 0),
    resetAt,
    days,
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
    const today = dayKey()
    const todayDevs = state.days?.[today] || {}
    save({
      ...state,
      days: { ...state.days, [today]: { ...todayDevs, [deviceId]: (todayDevs[deviceId] || 0) + 1 } },
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
    save({ ...empty(), settings: state.settings, settingsT: state.settingsT, resetAt: Date.now(), days: {} })
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

// ---- щоденна ціль і вогник ----
const dayTotal = (days, key) => Object.values(days?.[key] || {}).reduce((a, b) => a + b, 0)
const shiftDay = (key, delta) => {
  const d = new Date(key + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return dayKey(d)
}

export function streakInfo(st) {
  const goal = st.settings.dailyGoal || 20
  const today = dayKey()
  const todayCount = dayTotal(st.days, today)
  const done = (k) => dayTotal(st.days, k) >= goal
  // сьогодні ще можна встигнути, тому рахуємо від учора, якщо ціль ще не виконана
  let k = done(today) ? today : shiftDay(today, -1)
  let streak = 0
  while (done(k)) {
    streak++
    k = shiftDay(k, -1)
  }
  // найкраща серія
  let best = 0
  let run = 0
  let prev = null
  for (const d of Object.keys(st.days || {}).sort()) {
    if (!done(d)) {
      run = 0
      prev = d
      continue
    }
    run = prev && shiftDay(prev, 1) === d && run > 0 ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  // останні 7 днів для календарика
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = shiftDay(today, i - 6)
    return { key, done: done(key), count: dayTotal(st.days, key), isToday: key === today }
  })
  return { goal, todayCount, doneToday: todayCount >= goal, streak, best: Math.max(best, streak), week }
}
