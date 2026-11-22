import { sectionLabel, sectionName } from '../data.js'
import { statsFor } from '../store.js'
import { go } from '../router.js'
import { Header, Ring } from '../components.jsx'

export default function Topic({ data, st, id }) {
  const s = data.sections.find((x) => x.id === id)
  if (!s) return <Header title="Тему не знайдено" />
  const qs = data.bySection.get(s.id) || []
  const stt = statsFor(qs, st.q)
  const unsolved = stt.total - stt.mastered

  return (
    <>
      <Header title={`Розділ ${sectionLabel(s)}`} back="topics" />
      <main className="page">
        <section className="card hero">
          <Ring pct={stt.pct} label="засвоєно" />
          <div className="hero-stats">
            <h2 className="topic-heading">{sectionName(s)}</h2>
            <div>
              <b>{stt.mastered}</b> / {stt.total}
              <span>правильно відповіли</span>
            </div>
            <div>
              <b>{stt.wrong}</b>
              <span>зараз з помилкою</span>
            </div>
          </div>
        </section>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => go(`practice/topic/${id}/unsolved`)} disabled={!unsolved}>
            {stt.seen ? 'Продовжити' : 'Почати'} · {unsolved} невирішених
          </button>
          <button className="btn" onClick={() => go(`practice/topic/${id}/mistakes`)} disabled={!stt.wrong}>
            Тільки помилки ({stt.wrong})
          </button>
          <button className="btn" onClick={() => go(`practice/topic/${id}/all`)}>
            Усі питання по порядку ({stt.total})
          </button>
          <button className="btn" onClick={() => go(`practice/topic/${id}/shuffle`)}>
            Усі питання вперемішку
          </button>
        </div>
      </main>
    </>
  )
}
