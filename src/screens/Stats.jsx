import { questionsForCategory, sectionsForCategory, sectionLabel, sectionName, CATEGORIES } from '../data.js'
import { statsFor } from '../store.js'
import { go } from '../router.js'
import { Header, Ring, Bar } from '../components.jsx'

export default function Stats({ data, st }) {
  const cat = st.settings.category
  const all = statsFor(questionsForCategory(data, cat), st.q)
  const exams = st.exams.filter((e) => e.cat === cat || !e.cat)
  const passed = exams.filter((e) => e.passed).length
  const last10 = exams.slice(0, 10)
  const passRate10 = last10.length ? Math.round((last10.filter((e) => e.passed).length / last10.length) * 100) : 0

  // найслабші теми: де найбільше помилок відносно переглянутих
  const weak = sectionsForCategory(data, cat)
    .map((s) => ({ s, st: statsFor(data.bySection.get(s.id) || [], st.q) }))
    .filter((x) => x.st.wrong > 0)
    .sort((a, b) => b.st.wrong / b.st.seen - a.st.wrong / a.st.seen)
    .slice(0, 5)

  const chart = [...exams.slice(0, 20)].reverse()

  return (
    <>
      <Header title="Статистика" />
      <main className="page">
        <section className="card hero">
          <Ring pct={all.pct} label="засвоєно" />
          <div className="hero-stats">
            <div>
              <b>{all.seen}</b> / {all.total}
              <span>питань переглянуто ({all.seenPct}%)</span>
            </div>
            <div>
              <b>{all.mastered}</b>
              <span>відповідь правильна</span>
            </div>
            <div>
              <b>{all.wrong}</b>
              <span>зараз з помилкою</span>
            </div>
          </div>
        </section>

        <section className="card">
          <h3>Іспити (кат. {CATEGORIES[cat].label})</h3>
          <div className="kpis">
            <div>
              <b>{exams.length}</b>
              <span>спроб</span>
            </div>
            <div>
              <b>{passed}</b>
              <span>складено</span>
            </div>
            <div>
              <b>{passRate10}%</b>
              <span>успіх за останні 10</span>
            </div>
          </div>
          {chart.length > 0 ? (
            <div className="chart" aria-label="Результати останніх іспитів">
              {chart.map((e) => (
                <div key={e.t} className="chart-col" title={`${new Date(e.t).toLocaleString('uk-UA')}: ${e.correct}/${e.total}`}>
                  <div className={'chart-bar ' + (e.passed ? 'ok' : 'bad')} style={{ height: `${(e.correct / e.total) * 100}%` }} />
                </div>
              ))}
              <div className="chart-line" style={{ bottom: `${(18 / 20) * 100}%` }} title="Прохідний бал: 18/20" />
            </div>
          ) : (
            <p className="muted">Ще не було жодного іспиту. Спробуй - це найкращий спосіб перевірити себе.</p>
          )}
          {chart.length > 0 && <p className="muted small">Пунктир - прохідний бал (18 з 20)</p>}
        </section>

        {weak.length > 0 && (
          <section className="card">
            <h3>Над чим попрацювати</h3>
            <div className="list">
              {weak.map(({ s, st: x }) => (
                <button key={s.id} className="topic" onClick={() => go(`practice/topic/${s.id}/mistakes`)}>
                  <span className="topic-num bad">{sectionLabel(s)}</span>
                  <span className="topic-body">
                    <span className="topic-title">{sectionName(s)}</span>
                    <Bar value={x.pct} seen={x.seenPct} />
                    <span className="topic-sub">{x.wrong} з помилкою · натисни, щоб повторити</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {exams.length > 0 && (
          <section className="card">
            <h3>Історія</h3>
            <table className="history">
              <tbody>
                {exams.slice(0, 30).map((e) => (
                  <tr key={e.t}>
                    <td>{new Date(e.t).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}</td>
                    <td>
                      {e.correct}/{e.total}
                    </td>
                    <td>{Math.round(e.seconds / 60)} хв</td>
                    <td className={e.passed ? 'ok' : 'bad'}>{e.passed ? 'складено' : 'не складено'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </>
  )
}
