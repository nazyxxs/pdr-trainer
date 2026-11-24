import { useEffect, useState } from 'react'
import { useSync } from '../sync.js'
import {
  useSocial,
  getProfileByUsername,
  friendshipWith,
  sendFriendRequest,
  acceptFriend,
  removeFriendship,
  createBattle,
  battlesWith,
} from '../social.js'
import { CATEGORIES } from '../data.js'
import { go } from '../router.js'
import { Header, Avatar, displayName } from '../components.jsx'

export default function PublicProfile({ username }) {
  const sync = useSync()
  const social = useSocial()
  const [p, setP] = useState(undefined)
  const [fr, setFr] = useState(null)
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const reload = async () => {
    const prof = await getProfileByUsername(username)
    setP(prof)
    if (prof && social.userId && prof.id !== social.userId) {
      setFr(await friendshipWith(prof.id))
      setHistory(await battlesWith(prof.id))
    }
  }
  useEffect(() => {
    if (sync.user && social.userId) reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, sync.user, social.userId])

  if (!sync.user) {
    return (
      <>
        <Header title={'@' + username} />
        <main className="page center">
          <p>
            Увійди в акаунт, щоб додати <b>@{username}</b> у друзі.
          </p>
          <button className="btn btn-primary" onClick={() => go('account')}>
            Увійти або зареєструватися
          </button>
        </main>
      </>
    )
  }
  if (social.loaded && !social.profile) {
    return (
      <>
        <Header title={'@' + username} />
        <main className="page center">
          <p>Спершу створи свій профіль, а потім зможеш додати друга.</p>
          <button className="btn btn-primary" onClick={() => go('profile')}>
            Створити профіль
          </button>
        </main>
      </>
    )
  }
  if (p === undefined) return <div className="page center loading">Завантаження...</div>
  if (p === null) {
    return (
      <>
        <Header title="Не знайдено" back="friends" />
        <main className="page center">
          <p>Користувача @{username} не існує.</p>
        </main>
      </>
    )
  }

  const isMe = p.id === social.userId
  const s = p.stats || {}
  const act = (fn) => async () => {
    setBusy(true)
    setErr(null)
    try {
      await fn()
      await reload()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  const battle = act(async () => go('battle/' + (await createBattle(p.id))))

  let friendBtn
  if (isMe)
    friendBtn = (
      <button className="btn" onClick={() => go('profile')}>
        Редагувати профіль
      </button>
    )
  else if (!fr)
    friendBtn = (
      <button className="btn btn-primary" disabled={busy} onClick={act(() => sendFriendRequest(p.id))}>
        ➕ Додати в друзі
      </button>
    )
  else if (fr.status === 'pending' && fr.requester === social.userId)
    friendBtn = (
      <button className="btn" disabled={busy} onClick={act(() => removeFriendship(fr.id))}>
        Запит надіслано · скасувати
      </button>
    )
  else if (fr.status === 'pending')
    friendBtn = (
      <button className="btn btn-primary" disabled={busy} onClick={act(() => acceptFriend(fr.id))}>
        ✓ Прийняти запит у друзі
      </button>
    )
  else
    friendBtn = (
      <button className="btn btn-primary" disabled={busy} onClick={battle}>
        ⚔️ Викликати на батл
      </button>
    )

  const myWins = history.filter((b) => b.winner === social.userId).length
  const theirWins = history.filter((b) => b.winner === p.id).length

  return (
    <>
      <Header title={'@' + p.username} back="friends" />
      <main className="page">
        <section className="card">
          <div className="profile-head">
            <Avatar profile={p} size={76} />
            <div>
              <h2>{displayName(p)}</h2>
              <span className="muted">
                @{p.username}
                {s.category && ` · кат. ${CATEGORIES[s.category]?.label || s.category}`}
              </span>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="stat-grid">
            <div>
              <b>🔥 {s.streak || 0}</b>
              <span>днів поспіль</span>
            </div>
            <div>
              <b>{s.pct || 0}%</b>
              <span>бази засвоєно</span>
            </div>
            <div>
              <b>🏆 {s.wins || 0}</b>
              <span>перемог у батлах</span>
            </div>
            <div>
              <b>{s.best || 0}</b>
              <span>рекорд вогника</span>
            </div>
            <div>
              <b>
                {s.examsPassed || 0}/{s.exams || 0}
              </b>
              <span>іспитів складено</span>
            </div>
            <div>
              <b>{s.seen || 0}</b>
              <span>питань пройдено</span>
            </div>
          </div>
        </section>

        <div className="actions">
          {friendBtn}
          {fr?.status === 'accepted' && (
            <button
              className="btn btn-danger"
              disabled={busy}
              onClick={() => confirm(`Видалити ${displayName(p)} з друзів?`) && act(() => removeFriendship(fr.id))()}
            >
              Видалити з друзів
            </button>
          )}
          {err && <p className="note bad">{err}</p>}
        </div>

        {history.length > 0 && (
          <section className="card">
            <h3>
              Ваші батли: {myWins} : {theirWins}
            </h3>
            <table className="history">
              <tbody>
                {history.map((b) => {
                  const iAmHost = b.host === social.userId
                  const mine = iAmHost ? b.host_score : b.guest_score
                  const theirs = iAmHost ? b.guest_score : b.host_score
                  const res = b.winner === social.userId ? 'перемога' : b.winner ? 'поразка' : 'нічия'
                  return (
                    <tr key={b.id} onClick={() => go('battle/' + b.id)} style={{ cursor: 'pointer' }}>
                      <td>{new Date(b.created_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}</td>
                      <td>
                        {mine} : {theirs}
                      </td>
                      <td className={b.winner === social.userId ? 'ok' : b.winner ? 'bad' : ''}>{res}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </>
  )
}
