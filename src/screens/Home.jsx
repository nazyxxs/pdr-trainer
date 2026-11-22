import { CATEGORIES, questionsForCategory } from '../data.js'
import { statsFor } from '../store.js'
import { go } from '../router.js'
import { Header, Ring } from '../components.jsx'
import { useSync } from '../sync.js'

export default function Home({ data, st }) {
  const cat = st.settings.category
  const sync = useSync()
  const qs = questionsForCategory(data, cat)
  const s = statsFor(qs, st.q)
  const mistakes = qs.filter((q) => st.q[q.id] && st.q[q.id].last === 0).length
  const lastExams = st.exams.slice(0, 5)
  const passed = st.exams.filter((e) => e.passed).length

  return (
    <>
      <Header
        title="Тренажер"
        back={null}
        right={
          <>
            <button className="chip" onClick={() => go('settings')}>
              Кат. {CATEGORIES[cat].label}
            </button>
            {sync.configured && (
              <button
                className={'chip account-chip ' + (sync.user ? sync.state : 'guest')}
                onClick={() => go('account')}
                title={sync.user ? sync.user.email : 'Увійти'}
              >
                {sync.user ? '👤' : 'Увійти'}
              </button>
            )}
          </>
        }
      />
      <main className="page">
        <section className="card hero">
          <Ring pct={s.pct} label="засвоєно" />
          <div className="hero-stats">
            <div>
              <b>{s.mastered}</b> / {s.total}
              <span>правильно відповіли</span>
            </div>
            <div>
              <b>{s.seenPct}%</b>
              <span>бази переглянуто</span>
            </div>
            <div>
              <b>
                {passed}/{st.exams.length}
              </b>
              <span>іспитів складено</span>
            </div>
          </div>
        </section>

        <section className="tiles">
          <button className="tile tile-primary" onClick={() => go('exam')}>
            <span className="tile-icon">⏱</span>
            <b>Іспит</b>
            <span>20 питань · 20 хв · до 2 помилок</span>
          </button>
          <button className="tile" onClick={() => go('topics')}>
            <span className="tile-icon">📚</span>
            <b>Теми</b>
            <span>Проходь розділи по черзі</span>
          </button>
          <button className="tile" onClick={() => go('practice/mistakes')} disabled={!mistakes}>
            <span className="tile-icon">🔁</span>
            <b>Мої помилки</b>
            <span>{mistakes ? `${mistakes} питань на повторення` : 'Поки помилок немає'}</span>
          </button>
          <button className="tile" onClick={() => go('practice/new')}>
            <span className="tile-icon">✨</span>
            <b>Нові питання</b>
            <span>20 питань, які ще не бачив</span>
          </button>
          <button className="tile" onClick={() => go('practice/random')}>
            <span className="tile-icon">🎲</span>
            <b>Тренування</b>
            <span>20 випадкових з підказками</span>
          </button>
          <button className="tile" onClick={() => go('stats')}>
            <span className="tile-icon">📊</span>
            <b>Статистика</b>
            <span>Прогрес і історія іспитів</span>
          </button>
        </section>

        {lastExams.length > 0 && (
          <section className="card">
            <h3>Останні іспити</h3>
            <div className="exam-dots">
              {lastExams.map((e) => (
                <div key={e.t} className={'exam-dot ' + (e.passed ? 'ok' : 'bad')} title={new Date(e.t).toLocaleString('uk-UA')}>
                  {e.correct}/{e.total}
                </div>
              ))}
            </div>
          </section>
        )}
        <footer className="footer">
          Офіційна база ГСЦ МВС ({data.version}) · {data.questions.length} питань
          <br />
          made by <b>nazyxxs</b>
        </footer>
      </main>
    </>
  )
}
