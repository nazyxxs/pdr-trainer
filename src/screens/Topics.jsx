import { useState } from 'react'
import { CATEGORIES, sectionsForCategory, sectionLabel, sectionName } from '../data.js'
import { statsFor } from '../store.js'
import { go } from '../router.js'
import { Header, Bar } from '../components.jsx'

export default function Topics({ data, st }) {
  const cat = st.settings.category
  const [filter, setFilter] = useState('')
  const sections = sectionsForCategory(data, cat).filter((s) => sectionName(s).toLowerCase().includes(filter.toLowerCase()))
  const general = sections.filter((s) => s.id <= 41)
  const extra = sections.filter((s) => s.id > 41)

  const row = (s) => {
    const qs = data.bySection.get(s.id) || []
    const stt = statsFor(qs, st.q)
    return (
      <button key={s.id} className="topic" onClick={() => go('topic/' + s.id)}>
        <span className={'topic-num' + (stt.pct === 100 ? ' done' : '')}>{stt.pct === 100 ? '✓' : sectionLabel(s)}</span>
        <span className="topic-body">
          <span className="topic-title">{sectionName(s)}</span>
          <Bar value={stt.pct} seen={stt.seenPct} />
          <span className="topic-sub">
            {stt.mastered}/{stt.total} засвоєно{stt.wrong ? ` · ${stt.wrong} з помилкою` : ''}
          </span>
        </span>
      </button>
    )
  }

  return (
    <>
      <Header title="Теми" />
      <main className="page">
        <input className="search" placeholder="Пошук теми..." value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="list">{general.map(row)}</div>
        {extra.length > 0 && (
          <>
            <h3 className="list-title">Додатково для категорії {CATEGORIES[cat].label}</h3>
            <div className="list">{extra.map(row)}</div>
          </>
        )}
      </main>
    </>
  )
}
