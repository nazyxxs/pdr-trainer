import { useEffect, useRef, useState } from 'react'
import {
  useSocial,
  useLive,
  getBattle,
  getBattleAnswers,
  setBattleStatus,
  submitBattleAnswer,
  finishBattle,
  battleScore,
  createBattle,
  dismissInvite,
  BATTLE_LIMIT,
  BATTLE_COUNTDOWN,
} from '../social.js'
import { store } from '../store.js'
import { go } from '../router.js'
import { Header, QuestionView, Slide, useSwipe, Avatar, displayName } from '../components.jsx'

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.max(0, s) % 60).padStart(2, '0')}`

export default function Battle({ data, id }) {
  const social = useSocial()
  const [nonce, setNonce] = useState(0)
  const battle = useLive(() => getBattle(id), [id, social.userId, nonce], { table: 'battles', filter: `id=eq.${id}`, every: 4000 })
  const serverAnswers = useLive(() => getBattleAnswers(id), [id, social.userId, nonce], {
    table: 'battle_answers',
    filter: `battle_id=eq.${id}`,
    every: 3000,
  })
  const [local, setLocal] = useState({}) // мої відповіді одразу, не чекаючи сервера
  const [idx, setIdx] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [err, setErr] = useState(null)
  const finishing = useRef(false)
  const refresh = () => setNonce((n) => n + 1)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])

  const me = social.userId
  const answers = serverAnswers || []
  const iAmHost = battle?.host === me
  const opp = battle ? (iAmHost ? battle.guestP : battle.hostP) : null
  const myAnswers = { ...Object.fromEntries(answers.filter((a) => a.user_id === me).map((a) => [a.q_index, a.answer])), ...local }
  const oppList = answers.filter((a) => a.user_id !== me)
  const questions = battle ? battle.question_ids.map((qid) => data.byId.get(qid)) : []
  const myCorrect = Object.entries(myAnswers).filter(([i, a]) => questions[i]?.a === a).length
  const myDone = Object.keys(myAnswers).length
  const oppCorrect = oppList.filter((a) => a.correct).length

  const start = battle?.started_at ? new Date(battle.started_at).getTime() + BATTLE_COUNTDOWN * 1000 : null
  const left = start ? Math.ceil((start + BATTLE_LIMIT * 1000 - now) / 1000) : BATTLE_LIMIT

  // кінець батлу: обидва відповіли на всі питання або вийшов час
  useEffect(() => {
    if (!battle || battle.status !== 'active' || finishing.current) return
    const allDone = myDone === 20 && oppList.length === 20
    if (allDone || left <= -2) {
      finishing.current = true
      getBattleAnswers(id)
        .then((all) => finishBattle(battle, all))
        .then(refresh)
        .catch(() => (finishing.current = false))
    }
  }, [battle, myDone, oppList.length, left, id])

  const swipe = useSwipe(
    () => setIdx((i) => Math.min(19, i + 1)),
    () => setIdx((i) => Math.max(0, i - 1)),
  )

  if (battle === undefined || !social.userId) return <div className="page center loading">Завантаження батлу...</div>
  if (battle === null)
    return (
      <>
        <Header title="Батл" back="friends" />
        <main className="page center">
          <p>Батл не знайдено.</p>
        </main>
      </>
    )

  const act = (fn) => async () => {
    setErr(null)
    try {
      await fn()
      refresh()
    } catch (e) {
      setErr(e.message)
    }
  }
  const rematch = act(async () => go('battle/' + (await createBattle(opp.id))))

  // ---------- очікування ----------
  if (battle.status === 'waiting') {
    const expired = now - new Date(battle.created_at).getTime() > 10 * 60 * 1000
    return (
      <>
        <Header title="Батл" back="friends" />
        <main className="page center">
          <VsHeader left={iAmHost ? battle.hostP : battle.guestP} right={opp} />
          {expired ? (
            <p>Запрошення застаріло.</p>
          ) : iAmHost ? (
            <>
              <div className="pulse">⏳</div>
              <p>
                Чекаємо, поки <b>{displayName(opp)}</b> прийме виклик...
              </p>
              <p className="muted small">Друг побачить запрошення на будь-якому екрані сайту.</p>
              <button className="btn" onClick={act(() => setBattleStatus(id, 'cancelled', 'waiting'))}>
                Скасувати
              </button>
            </>
          ) : (
            <>
              <p>
                <b>{displayName(opp)}</b> викликає тебе на батл: 20 питань, {BATTLE_LIMIT / 60} хвилин.
              </p>
              <div className="actions">
                <button
                  className="btn btn-primary"
                  onClick={act(async () => {
                    dismissInvite(id)
                    await setBattleStatus(id, 'active', 'waiting')
                  })}
                >
                  ⚔️ Прийняти
                </button>
                <button
                  className="btn"
                  onClick={act(async () => {
                    dismissInvite(id)
                    await setBattleStatus(id, 'declined', 'waiting')
                    go('friends')
                  })}
                >
                  Відхилити
                </button>
              </div>
            </>
          )}
          {err && <p className="note bad">{err}</p>}
        </main>
      </>
    )
  }

  if (battle.status === 'declined' || battle.status === 'cancelled') {
    return (
      <>
        <Header title="Батл" back="friends" />
        <main className="page center">
          <div className="empty">🤷</div>
          <p>{battle.status === 'declined' ? `${displayName(opp)} відхилив виклик.` : 'Батл скасовано.'}</p>
          <button className="btn btn-primary" onClick={() => go('friends')}>
            До друзів
          </button>
        </main>
      </>
    )
  }

  // ---------- результат ----------
  if (battle.status === 'finished') {
    const s = battleScore(battle, answers)
    const mine = iAmHost ? s.host : s.guest
    const theirs = iAmHost ? s.guest : s.host
    const won = battle.winner === me
    const draw = !battle.winner
    return (
      <>
        <Header title="Результат батлу" back="friends" />
        <main className="page center">
          <div className="empty">{won ? '🏆' : draw ? '🤝' : '💪'}</div>
          <h2>{won ? 'Перемога!' : draw ? 'Нічия' : 'Поразка'}</h2>
          <div className="vs-result">
            <ResultSide p={iAmHost ? battle.hostP : battle.guestP} score={mine.correct} crown={won} label="Ти" />
            <span className="vs">:</span>
            <ResultSide p={opp} score={theirs.correct} crown={battle.winner === opp.id} />
          </div>
          {!draw && mine.correct === theirs.correct && <p className="muted small">Однаково правильних, переміг швидший.</p>}
          <AnswerStrip label="Ти" list={answers.filter((a) => a.user_id === me)} />
          <AnswerStrip label={displayName(opp)} list={answers.filter((a) => a.user_id !== me)} />
          <div className="actions">
            <button className="btn btn-primary" onClick={rematch}>
              🔁 Реванш
            </button>
            <button className="btn" onClick={() => go('friends')}>
              До друзів
            </button>
          </div>
          {err && <p className="note bad">{err}</p>}
        </main>
      </>
    )
  }

  // ---------- відлік 3-2-1 ----------
  if (now < start) {
    return (
      <main className="page center countdown">
        <VsHeader left={iAmHost ? battle.hostP : battle.guestP} right={opp} />
        <div className="count-num">{Math.ceil((start - now) / 1000)}</div>
        <p className="muted">Приготуйся!</p>
      </main>
    )
  }

  // ---------- гра ----------
  const q = questions[idx]
  const sel = myAnswers[idx]
  const finishedMine = myDone === 20 || left <= 0

  const choose = async (i) => {
    if (sel !== undefined || finishedMine) return
    setLocal((l) => ({ ...l, [idx]: i }))
    store.answer(q.id, i === q.a)
    try {
      await submitBattleAnswer(id, idx, i, i === q.a)
    } catch (e) {
      setErr(e.message)
    }
  }
  const nextUnanswered = () => {
    for (let k = 1; k <= 20; k++) {
      const j = (idx + k) % 20
      if (myAnswers[j] === undefined) return setIdx(j)
    }
  }

  const board = (
    <div className="scoreboard">
      <Player p={iAmHost ? battle.hostP : battle.guestP} label="Ти" correct={myCorrect} done={myDone} />
      <span className={'timer' + (left < 60 ? ' warn' : '')}>{fmt(Math.max(0, left))}</span>
      <Player p={opp} correct={oppCorrect} done={oppList.length} right />
    </div>
  )

  if (finishedMine) {
    return (
      <>
        <Header title="Батл" back={null} />
        {board}
        <main className="page center">
          <div className="pulse">⏳</div>
          <p>
            {left <= 0 ? 'Час вийшов!' : 'Ти відповів на всі питання!'} Чекаємо на <b>{displayName(opp)}</b>...
          </p>
          <p className="muted small">
            Суперник: {oppList.length}/20 відповідей, {oppCorrect} правильних
          </p>
        </main>
      </>
    )
  }

  return (
    <>
      <Header title="Батл" back={null} />
      {board}
      <div className="grid-nav exam-nav">
        {questions.map((qq, i) => (
          <button
            key={i}
            className={'nav-cell' + (i === idx ? ' current' : '') + (myAnswers[i] === undefined ? '' : myAnswers[i] === qq?.a ? ' ok' : ' bad')}
            onClick={() => setIdx(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <main className="page" {...swipe}>
        {q ? (
          <Slide index={idx}>
            <QuestionView key={q.id} q={q} selected={sel} reveal={sel !== undefined} onSelect={choose} />
          </Slide>
        ) : (
          <p className="muted">Питання не знайдено в базі (оновіть сайт).</p>
        )}
        {sel !== undefined && q && (
          <div className={'feedback ' + (sel === q.a ? 'ok' : 'bad')}>{sel === q.a ? 'Правильно!' : `Помилка. Правильна відповідь: ${q.a + 1}`}</div>
        )}
        {err && <p className="note bad">{err}</p>}
      </main>
      <nav className="bottom-bar">
        <button className="btn btn-primary grow" onClick={nextUnanswered}>
          {sel !== undefined ? 'Наступне питання →' : 'Пропустити →'}
        </button>
      </nav>
    </>
  )
}

function Player({ p, label, correct, done, right }) {
  return (
    <div className={'player' + (right ? ' right' : '')}>
      <Avatar profile={p} size={34} />
      <div className="player-info">
        <b>{label || displayName(p)}</b>
        <span>
          ✓ {correct} · {done}/20
        </span>
        <div className="bar">
          <div className="bar-fill" style={{ width: `${(done / 20) * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

function VsHeader({ left, right }) {
  return (
    <div className="vs-result">
      <ResultSide p={left} label="Ти" />
      <span className="vs">VS</span>
      <ResultSide p={right} />
    </div>
  )
}

function ResultSide({ p, score, crown, label }) {
  return (
    <div className="result-side">
      <div className="crown">{crown ? '👑' : ''}</div>
      <Avatar profile={p} size={64} />
      <b>{label || displayName(p)}</b>
      {score !== undefined && <span className="result-score">{score}</span>}
    </div>
  )
}

function AnswerStrip({ label, list }) {
  const by = Object.fromEntries(list.map((a) => [a.q_index, a.correct]))
  return (
    <div className="strip">
      <span>{label}</span>
      <div>
        {Array.from({ length: 20 }, (_, i) => (
          <i key={i} className={by[i] === undefined ? '' : by[i] ? 'ok' : 'bad'} />
        ))}
      </div>
    </div>
  )
}
