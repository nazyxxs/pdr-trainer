import { useCallback, useEffect, useState } from 'react'
import { questionsForCategory, shuffle } from '../data.js'
import { store } from '../store.js'
import { go } from '../router.js'
import { Header, QuestionView } from '../components.jsx'

// Формує список питань для режиму тренування
function buildList(data, st, mode, args) {
  const cat = st.settings.category
  const all = questionsForCategory(data, cat)
  const rec = (q) => st.q[q.id]
  if (mode === 'topic') {
    const [sid, sub] = args
    const qs = data.bySection.get(Number(sid)) || []
    if (sub === 'unsolved') return { title: 'Невирішені', back: 'topic/' + sid, list: qs.filter((q) => !rec(q) || rec(q).last !== 1) }
    if (sub === 'mistakes') return { title: 'Помилки в темі', back: 'topic/' + sid, list: qs.filter((q) => rec(q) && rec(q).last === 0) }
    if (sub === 'shuffle') return { title: 'Вперемішку', back: 'topic/' + sid, list: shuffle(qs) }
    return { title: 'Усі питання', back: 'topic/' + sid, list: qs }
  }
  if (mode === 'mistakes') return { title: 'Мої помилки', back: '', list: shuffle(all.filter((q) => rec(q) && rec(q).last === 0)) }
  if (mode === 'new') return { title: 'Нові питання', back: '', list: shuffle(all.filter((q) => !rec(q))).slice(0, 20) }
  return { title: 'Тренування', back: '', list: shuffle(all).slice(0, 20) }
}

export default function Practice({ data, mode, args }) {
  const [session] = useState(() => buildList(data, store.get(), mode, args))
  const { list } = session
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState({}) // індекс -> обрана відповідь
  const [done, setDone] = useState(false)

  const q = list[idx]
  const sel = answers[idx]
  const revealed = sel !== undefined

  const choose = useCallback(
    (i) => {
      if (revealed || !q) return
      setAnswers((a) => ({ ...a, [idx]: i }))
      store.answer(q.id, i === q.a)
    },
    [revealed, q, idx],
  )
  const next = useCallback(() => {
    if (idx + 1 < list.length) setIdx(idx + 1)
    else setDone(true)
  }, [idx, list.length])

  useEffect(() => {
    const onKey = (e) => {
      if (done) return
      const n = Number(e.key)
      if (n >= 1 && n <= (q?.o.length || 0)) choose(n - 1)
      else if ((e.key === 'Enter' || e.key === 'ArrowRight') && revealed) next()
      else if (e.key === 'ArrowLeft' && idx > 0) setIdx(idx - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [choose, next, revealed, idx, q, done])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [idx])

  if (!list.length) {
    return (
      <>
        <Header title={session.title} back={session.back} />
        <main className="page center">
          <div className="empty">🎉</div>
          <p>Тут поки нічого немає - все вирішено!</p>
          <button className="btn btn-primary" onClick={() => go(session.back)}>
            Назад
          </button>
        </main>
      </>
    )
  }

  const answeredCount = Object.keys(answers).length
  const correct = Object.entries(answers).filter(([i, a]) => list[i].a === a).length

  if (done) {
    const pct = answeredCount ? Math.round((correct / answeredCount) * 100) : 0
    return (
      <>
        <Header title="Результат" back={session.back} />
        <main className="page center">
          <div className="result-big">{pct}%</div>
          <p>
            Правильно: <b>{correct}</b> з {answeredCount}
          </p>
          <div className="actions">
            <button className="btn btn-primary" onClick={() => go(session.back)}>
              Готово
            </button>
            {correct < answeredCount && (
              <button className="btn" onClick={() => go('practice/mistakes/' + Date.now())}>
                Повторити помилки
              </button>
            )}
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <Header
        title={session.title}
        back={session.back}
        right={
          <span className="counter">
            ✓ {correct} · ✗ {answeredCount - correct}
          </span>
        }
      />
      <div className="progress">
        <div style={{ width: `${((idx + (revealed ? 1 : 0)) / list.length) * 100}%` }} />
      </div>
      <main className="page">
        <QuestionView key={q.id} q={q} selected={sel} reveal={revealed} onSelect={choose} number={idx + 1} total={list.length} />
        {revealed && (
          <div className={'feedback ' + (sel === q.a ? 'ok' : 'bad')}>
            {sel === q.a ? 'Правильно!' : `Неправильно. Правильна відповідь: ${q.a + 1}`}
          </div>
        )}
      </main>
      <nav className="bottom-bar">
        <button className="btn" onClick={() => setIdx(idx - 1)} disabled={idx === 0}>
          ←
        </button>
        <button className="btn btn-primary grow" onClick={next} disabled={!revealed}>
          {idx + 1 < list.length ? 'Далі →' : 'Завершити'}
        </button>
        {!revealed && (
          <button className="btn" onClick={next} title="Пропустити">
            Пропустити
          </button>
        )}
      </nav>
    </>
  )
}
