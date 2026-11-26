import { useEffect, useState } from 'react'
import { useSync } from '../sync.js'
import {
  useSocial,
  listFriendships,
  searchProfiles,
  sendFriendRequest,
  acceptFriend,
  removeFriendship,
  createBattle,
  inviteLink,
  useLive,
} from '../social.js'
import { go } from '../router.js'
import { Header, Avatar, displayName } from '../components.jsx'

const METRICS = [
  ['streak', '🔥 Вогник', (s) => s.streak || 0, (v) => `${v} дн.`],
  ['pct', '📚 Засвоєно', (s) => s.pct || 0, (v) => `${v}%`],
  ['wins', '🏆 Перемоги', (s) => s.wins || 0, (v) => `${v}`],
]

export default function Friends() {
  const sync = useSync()
  const social = useSocial()
  const [tab, setTab] = useState('friends')
  const [metric, setMetric] = useState('streak')
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)
  const [nonce, setNonce] = useState(0)

  const data = useLive(listFriendships, [social.userId, social.profile?.id, nonce], {
    table: 'friendships',
    filter: undefined,
    every: 20000,
  })

  useEffect(() => {
    if (!q.trim()) return setFound([])
    const t = setTimeout(() => searchProfiles(q).then(setFound), 300)
    return () => clearTimeout(t)
  }, [q])

  if (sync.configured && !sync.authReady) return <div className="page center loading">Завантаження...</div>
  if (!sync.configured || !sync.user) {
    return (
      <>
        <Header title="Друзі" />
        <main className="page center">
          <div className="empty">👥</div>
          <p>Додавай друзів, змагайся в рейтингу і проводь батли. Для цього потрібен акаунт.</p>
          <button className="btn btn-primary" onClick={() => go('account')}>
            Увійти або зареєструватися
          </button>
        </main>
      </>
    )
  }
  if (!social.loaded) return <div className="page center loading">Завантаження...</div>
  if (!social.profile) {
    return (
      <>
        <Header title="Друзі" />
        <main className="page center">
          <div className="empty">👋</div>
          <p>Створи профіль з нікнеймом, щоб друзі могли тебе знайти.</p>
          <button className="btn btn-primary" onClick={() => go('profile')}>
            Створити профіль
          </button>
        </main>
      </>
    )
  }

  const me = social.profile
  const run = (key, fn) => async () => {
    setBusy(key)
    setMsg(null)
    try {
      await fn()
      setNonce((n) => n + 1)
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy(null)
    }
  }
  const battle = (id) => run('b' + id, async () => go('battle/' + (await createBattle(id))))
  const share = async () => {
    const url = inviteLink(me.username)
    try {
      if (navigator.share) await navigator.share({ title: 'Додай мене в ПДР Тренажері', url })
      else {
        await navigator.clipboard.writeText(url)
        setMsg('Посилання скопійовано')
      }
    } catch {
      /* скасовано */
    }
  }

  const friends = data?.friends || []
  const incoming = data?.incoming || []
  const outgoing = data?.outgoing || []
  const knownIds = new Set([...friends, ...incoming, ...outgoing].map((f) => f.other?.id))

  const person = (p, right, sub) => (
    <div className="person" key={p.id}>
      <button className="person-link" onClick={() => go('u/' + p.username)}>
        <Avatar profile={p} />
        <span className="person-body">
          <b>{displayName(p)}</b>
          <span>{sub ?? '@' + p.username}</span>
        </span>
      </button>
      <span className="person-actions">{right}</span>
    </div>
  )

  const [, , getV, fmt] = METRICS.find((m) => m[0] === metric)
  const ranking = [me, ...friends.map((f) => f.other)].filter(Boolean).sort((a, b) => getV(b.stats || {}) - getV(a.stats || {}))

  return (
    <>
      <Header
        title="Друзі"
        right={
          <button className="chip" onClick={() => go('u/' + me.username)}>
            <Avatar profile={me} size={22} /> @{me.username}
          </button>
        }
      />
      <main className="page">
        <div className="seg" style={{ marginBottom: 14 }}>
          <button className={tab === 'friends' ? 'active' : ''} onClick={() => setTab('friends')}>
            Друзі {incoming.length > 0 && <span className="badge">{incoming.length}</span>}
          </button>
          <button className={tab === 'rating' ? 'active' : ''} onClick={() => setTab('rating')}>
            Рейтинг
          </button>
        </div>
        {msg && <p className="note">{msg}</p>}

        {tab === 'friends' && (
          <>
            <input className="search" placeholder="🔍 Знайти за нікнеймом..." value={q} onChange={(e) => setQ(e.target.value)} autoCapitalize="none" />
            {found.length > 0 && (
              <div className="list" style={{ marginBottom: 16 }}>
                {found.map((p) =>
                  person(
                    p,
                    knownIds.has(p.id) ? (
                      <span className="muted small">вже в списку</span>
                    ) : (
                      <button className="btn btn-primary btn-sm" disabled={busy === 'a' + p.id} onClick={run('a' + p.id, () => sendFriendRequest(p.id))}>
                        Додати
                      </button>
                    ),
                  ),
                )}
              </div>
            )}
            {q.trim().length >= 2 && found.length === 0 && <p className="muted small">Нікого не знайдено</p>}

            {incoming.length > 0 && (
              <>
                <h3 className="list-title">Запити в друзі</h3>
                <div className="list">
                  {incoming.map((f) =>
                    person(
                      f.other,
                      <>
                        <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={run('y' + f.id, () => acceptFriend(f.id))}>
                          Прийняти
                        </button>
                        <button className="btn btn-sm" disabled={!!busy} onClick={run('n' + f.id, () => removeFriendship(f.id))}>
                          ✕
                        </button>
                      </>,
                    ),
                  )}
                </div>
              </>
            )}

            <h3 className="list-title">Мої друзі {friends.length > 0 && `(${friends.length})`}</h3>
            {data === undefined ? (
              <p className="muted">Завантаження...</p>
            ) : friends.length === 0 ? (
              <section className="card center-text">
                <p>Поки що друзів немає. Знайди друга за нікнеймом або надішли йому посилання.</p>
              </section>
            ) : (
              <div className="list">
                {friends.map((f) =>
                  person(
                    f.other,
                    <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={battle(f.other.id)}>
                      ⚔️ Батл
                    </button>,
                    `🔥 ${f.other.stats?.streak || 0} · ${f.other.stats?.pct || 0}% бази`,
                  ),
                )}
              </div>
            )}

            {outgoing.length > 0 && (
              <>
                <h3 className="list-title">Очікують підтвердження</h3>
                <div className="list">
                  {outgoing.map((f) =>
                    person(
                      f.other,
                      <button className="btn btn-sm" disabled={!!busy} onClick={run('c' + f.id, () => removeFriendship(f.id))}>
                        Скасувати
                      </button>,
                    ),
                  )}
                </div>
              </>
            )}

            <button className="btn" style={{ width: '100%', marginTop: 16 }} onClick={share}>
              🔗 Запросити друга посиланням
            </button>
          </>
        )}

        {tab === 'rating' && (
          <>
            <div className="seg" style={{ marginBottom: 12 }}>
              {METRICS.map(([k, label]) => (
                <button key={k} className={metric === k ? 'active' : ''} onClick={() => setMetric(k)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="list">
              {ranking.map((p, i) => (
                <button key={p.id} className={'person' + (p.id === me.id ? ' me' : '')} onClick={() => go('u/' + p.username)}>
                  <span className="rank">{['🥇', '🥈', '🥉'][i] || i + 1}</span>
                  <Avatar profile={p} size={38} />
                  <span className="person-body">
                    <b>
                      {displayName(p)}
                      {p.id === me.id && ' (ти)'}
                    </b>
                    <span>@{p.username}</span>
                  </span>
                  <b>{fmt(getV(p.stats || {}))}</b>
                </button>
              ))}
            </div>
            {friends.length === 0 && <p className="muted small">Додай друзів, щоб змагатися в рейтингу.</p>}
          </>
        )}
      </main>
    </>
  )
}
