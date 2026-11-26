// Завантаження бази питань і логіка категорій / білетів

let cache = null

export async function loadData() {
  if (cache) return cache
  const res = await fetch('./questions.json')
  const raw = await res.json()
  const byId = new Map(raw.questions.map((q) => [q.id, q]))
  const bySection = new Map()
  for (const q of raw.questions) {
    if (!bySection.has(q.s)) bySection.set(q.s, [])
    bySection.get(q.s).push(q)
  }
  cache = { ...raw, byId, bySection }
  return cache
}

// Розділи з id 1..41 - загальні для всіх категорій.
// Далі - додаткові розділи конкретних категорій (загальні / будова / юридична / безпека).
export const CATEGORIES = {
  A: { label: 'A1, A', title: 'Мотоцикли', extra: { general: 42, build: 43, law: 44, safety: 45 } },
  B: { label: 'B1, B', title: 'Легкові авто', extra: { general: 46, build: 47, law: 48, safety: 49 } },
  C: { label: 'C1, C', title: 'Вантажні авто', extra: { general: 50, build: 51, law: 52, safety: 53 } },
  D: { label: 'D1, D', title: 'Автобуси', extra: { general: 54, build: 55, law: 56, safety: 57 } },
  E: { label: 'BE, CE, DE', title: 'З причепом', extra: { general: 58, build: 59, law: 60, safety: 61 } },
  T: { label: 'T', title: 'Трактори, трамваї', extra: { general: 62, build: 63, law: 64, safety: 65 } },
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

export const SECTION_GROUPS = {
  rules: range(1, 36), // Правила дорожнього руху, знаки, розмітка
  safety: [37, 40], // Основи безпечного водіння, етика водіння
  firstAid: [39], // Домедична допомога
  law: [38, 41], // Основи права, європротокол
}

// Розділи, які показуємо для обраної категорії
export function sectionsForCategory(data, cat) {
  const extra = Object.values(CATEGORIES[cat].extra)
  return data.sections.filter((s) => s.id <= 41 || extra.includes(s.id))
}

export function questionsForCategory(data, cat) {
  return sectionsForCategory(data, cat).flatMap((s) => data.bySection.get(s.id) || [])
}

function pick(pool, n, taken) {
  const free = pool.filter((q) => !taken.has(q.id))
  const out = []
  while (out.length < n && free.length) {
    const i = Math.floor(Math.random() * free.length)
    const [q] = free.splice(i, 1)
    taken.add(q.id)
    out.push(q)
  }
  return out
}

const fromSections = (data, ids) => ids.flatMap((id) => data.bySection.get(id) || [])

// Білет як на іспиті в ТСЦ МВС: 20 питань = 10 ПДР + 4 безпека + 4 будова ТЗ + 2 інші
export function makeExamTicket(data, cat) {
  const ex = CATEGORIES[cat].extra
  const taken = new Set()
  const ticket = [
    ...pick(fromSections(data, [...SECTION_GROUPS.rules, ex.general]), 10, taken),
    ...pick(fromSections(data, [...SECTION_GROUPS.safety, ex.safety]), 4, taken),
    ...pick(fromSections(data, [ex.build]), 4, taken),
    ...pick(fromSections(data, SECTION_GROUPS.firstAid), 1, taken),
    ...pick(fromSections(data, [...SECTION_GROUPS.law, ex.law]), 1, taken),
  ]
  // якщо в якомусь розділі забракло питань - добираємо з усієї бази категорії
  if (ticket.length < 20) ticket.push(...pick(questionsForCategory(data, cat), 20 - ticket.length, taken))
  return ticket
}

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// "1. РЕГУЛЮВАННЯ ..." -> гарна назва з великої літери
export function prettyTitle(title) {
  const t = title.toLowerCase().replace('щодокатегорій', 'щодо категорій ').replace(/\s+/g, ' ').trim()
  // назви категорій (В1, В, C1E...) повертаємо великими літерами
  const fixed = t.replace(/(категорі[йїя]\s*)([^(]+)/, (m, a, cats) => a + cats.toUpperCase())
  return fixed.charAt(0).toUpperCase() + fixed.slice(1)
}

export function sectionLabel(s) {
  const sub = s.title.match(/^(\d+)\.\s/)
  return sub ? `${s.num}.${sub[1]}` : `${s.num}`
}

export function sectionName(s) {
  return prettyTitle(s.title.replace(/^\d+\.\s*/, ''))
}
