import { useCallback, useEffect, useRef, useState } from 'react'
import { makeExamTicket, CATEGORIES } from '../data.js'
import { store } from '../store.js'
import { go } from '../router.js'
import { Header, QuestionView, Slide, useSwipe } from '../components.jsx'

const LIMIT = 20 * 60 // 20 хвилин
const MAX_ERRORS = 2

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function Exam({ data }) {
  const cat = store.get().settings.category
  const [ticket, setTicket] = useState(() => makeExamTicket(data, cat))
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState({})
  const [left, setLeft] = useState(LIMIT)
  const [finished, setFinished] = useState(null) // {reason}
  const [review, setReview] = useState(null)
  const started = useRef(Date.now())
  const finishedRef = useRef(false)

  const errors = Object.entries(answers).filter(([i, a]) => ticket[i].a !== a).length
  const answered = Object.keys(answers).length

  const finish = useCallback(
    (reason) => {
      if (finishedRef.current) return
      finishedRef.current = true
      const correct = Object.entries(answers).filter(([i, a]) => ticket[i].a === a).length
      const passed = reason === 'done' && answered === ticket.length && ticket.length - correct <= MAX_ERRORS
      Object.entries(answers).forEach(([i, a]) => store.answer(ticket[i].id, ticket[i].a === a))
      store.addExam({ t: Date.now(), correct, total: ticket.length, passed, seconds: Math.round((Date.now() - started.current) / 1000), cat })
      setFinished({ reason, correct, passed })
    },
    [answers, answered, ticket, cat],
  )

  // таймер
  useEffect(() => {
    if (finished) return
    const t = setInterval(() => setLeft(Math.max(0, LIMIT - Math.floor((Date.now() - started.current) / 1000))), 500)
    return () => clearInterval(t)
  }, [finished])
  useEffect(() => {
    if (left === 0 && !finished) finish('time')
  }, [left, finished, finish])
  // як на іспиті: третя помилка - іспит не складено
  // невелика пауза, щоб встигнути побачити підсвітку останньої відповіді
  useEffect(() => {
    if (finished) return
    const reason = errors > MAX_ERRORS ? 'errors' : answered === ticket.length ? 'done' : null
    if (!reason) return
    const t = setTimeout(() => finish(reason), 1500)
    return () => clearTimeout(t)
  }, [errors, answered, ticket.length, finished, finish])

  const choose = (i) => {
    if (answers[idx] !== undefined || finished) return
    // як у сервісному центрі: одразу видно, правильно чи ні
    setAnswers({ ...answers, [idx]: i })
  }

  const skip = () => {
    for (let k = 1; k <= ticket.length; k++) {
      const j = (idx + k) % ticket.length
      if (answers[j] === undefined) return setIdx(j)
    }
  }

  const swipeExam = useSwipe(
    () => (answered < ticket.length ? skip() : idx < ticket.length - 1 && setIdx(idx + 1)),
    () => idx > 0 && setIdx(idx - 1),
  )
  const swipeReview = useSwipe(
    () => review !== null && review < ticket.length - 1 && setReview(review + 1),
    () => review !== null && review > 0 && setReview(review - 1),
  )

  useEffect(() => {
    const onKey = (e) => {
      if (finished) return
      const n = Number(e.key)
      if (n >= 1 && n <= ticket[idx].o.length) choose(n - 1)
      else if ((e.key === 'Enter' || e.key === 'ArrowRight') && answers[idx] !== undefined) skip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const restart = () => {
    setTicket(makeExamTicket(data, cat))
    setIdx(0)
    setAnswers({})
    setLeft(LIMIT)
    setFinished(null)
    setReview(null)
    started.current = Date.now()
    finishedRef.current = false
  }

  if (finished && review === null) {
    const msg = { time: 'Час вийшов', errors: 'Більше 2 помилок', done: finished.passed ? 'Іспит складено!' : 'Іспит не складено' }[finished.reason]
    return (
      <>
        <Header title="Результат іспиту" />
        <main className="page center">
          <div className={'result-badge ' + (finished.passed ? 'ok' : 'bad')}>{finished.passed ? '✓' : '✗'}</div>
          <h2>{finished.passed ? 'Іспит складено!' : msg}</h2>
          <p>
            Правильно: <b>{finished.correct}</b> з {ticket.length} · помилок: {errors} · час: {fmt(LIMIT - left)}
          </p>
          <div className="grid-nav">
            {ticket.map((q, i) => (
              <button
                key={q.id}
                className={'nav-cell ' + (answers[i] === undefined ? 'skip' : answers[i] === q.a ? 'ok' : 'bad')}
                onClick={() => setReview(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <p className="muted">Натисни на номер, щоб переглянути питання</p>
          <div className="actions">
            <button className="btn btn-primary" onClick={restart}>
              Новий білет
            </button>
            <button className="btn" onClick={() => go('')}>
              На головну
            </button>
          </div>
        </main>
      </>
    )
  }

  if (finished && review !== null) {
    const q = ticket[review]
    return (
      <>
        <Header title={`Розбір: питання ${review + 1}`} right={<button className="chip" onClick={() => setReview(null)}>До результату</button>} />
        <main className="page" {...swipeReview}>
          <Slide index={review}>
            <QuestionView q={q} selected={answers[review]} reveal onSelect={() => {}} />
          </Slide>
          {answers[review] === undefined && <div className="feedback bad">Без відповіді. Правильна: {q.a + 1}</div>}
        </main>
        <nav className="bottom-bar">
          <button className="btn" disabled={review === 0} onClick={() => setReview(review - 1)}>
            ←
          </button>
          <button className="btn grow" onClick={() => setReview(null)}>
            До результату
          </button>
          <button className="btn" disabled={review === ticket.length - 1} onClick={() => setReview(review + 1)}>
            →
          </button>
        </nav>
      </>
    )
  }

  const q = ticket[idx]
  return (
    <>
      <Header
        title={`Іспит · кат. ${CATEGORIES[cat].label}`}
        right={<span className={'timer' + (left < 120 ? ' warn' : '')}>{fmt(left)}</span>}
      />
      <div className="grid-nav exam-nav">
        {ticket.map((t, i) => (
          <button
            key={t.id}
            className={'nav-cell' + (i === idx ? ' current' : '') + (answers[i] === undefined ? '' : answers[i] === t.a ? ' ok' : ' bad')}
            onClick={() => setIdx(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <main className="page" {...swipeExam}>
        <Slide index={idx}>
          <QuestionView key={q.id} q={q} selected={answers[idx]} reveal={answers[idx] !== undefined} onSelect={choose} />
        </Slide>
        {answers[idx] !== undefined && (
          <div className={'feedback ' + (answers[idx] === q.a ? 'ok' : 'bad')}>
            {answers[idx] === q.a ? 'Правильно!' : `Помилка. Правильна відповідь: ${q.a + 1}`}
          </div>
        )}
        <p className="muted small">
          Помилок: {errors} з {MAX_ERRORS} допустимих
        </p>
      </main>
      <nav className="bottom-bar">
        <button className="btn" onClick={() => (confirm('Завершити іспит достроково?') ? finish('done') : null)}>
          Завершити
        </button>
        <button className="btn btn-primary grow" onClick={skip} disabled={answered === ticket.length}>
          {answers[idx] !== undefined ? 'Наступне питання →' : 'Пропустити →'}
        </button>
      </nav>
    </>
  )
}
