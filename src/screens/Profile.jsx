import { useEffect, useRef, useState } from 'react'
import { useSync } from '../sync.js'
import { useSocial, saveProfile, uploadAvatar, inviteLink } from '../social.js'
import { go } from '../router.js'
import { Header, Avatar } from '../components.jsx'

const EMOJIS = ['🚗', '🏎️', '🚙', '🚕', '🚓', '🚌', '🏍️', '🛵', '🚲', '🛻', '🚦', '🛣️', '🦊', '🐱', '🐶', '🐼', '🦁', '🐸', '🐧', '🦉', '😎', '🤓', '🔥', '⚡']
const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#475569']

export default function Profile() {
  const sync = useSync()
  const social = useSocial()
  const p = social.profile
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    if (social.loaded && !form) {
      setForm({
        username: p?.username || '',
        display_name: p?.display_name || '',
        avatar_emoji: p?.avatar_emoji || '🚗',
        avatar_color: p?.avatar_color || '#2563eb',
        avatar_url: p?.avatar_url || null,
      })
    }
  }, [social.loaded, p, form])

  if (sync.configured && !sync.authReady) return <div className="page center loading">Завантаження...</div>
  if (!sync.configured || !sync.user) {
    return (
      <>
        <Header title="Профіль" />
        <main className="page center">
          <p>Щоб мати профіль і друзів, увійди в акаунт.</p>
          <button className="btn btn-primary" onClick={() => go('account')}>
            Увійти
          </button>
        </main>
      </>
    )
  }
  if (!form) return <div className="page center loading">Завантаження...</div>

  const isNew = !p
  const upd = (patch) => setForm((f) => ({ ...f, ...patch }))

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setMsg(null)
    try {
      upd({ avatar_url: await uploadAvatar(file) })
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await saveProfile({ ...form, username: form.username.trim().toLowerCase(), display_name: form.display_name.trim() || null })
      const saved = form.username.trim().toLowerCase()
      if (isNew) go('friends')
      else go('u/' + saved)
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const share = async () => {
    const url = inviteLink(p.username)
    try {
      if (navigator.share) await navigator.share({ title: 'Додай мене в ПДР Тренажері', url })
      else {
        await navigator.clipboard.writeText(url)
        setMsg({ ok: true, text: 'Посилання скопійовано' })
      }
    } catch {
      /* користувач закрив вікно "поділитися" */
    }
  }

  return (
    <>
      <Header title={isNew ? 'Створи профіль' : 'Мій профіль'} back={isNew ? '' : 'u/' + p.username} />
      <main className="page">
        {isNew && <p className="muted">Профіль потрібен, щоб друзі могли тебе знайти і викликати на батл.</p>}
        <form onSubmit={save}>
          <section className="card">
            <div className="profile-head">
              <Avatar profile={form} size={76} />
              <div>
                <h2>{form.display_name || form.username || 'Твоє ім’я'}</h2>
                <span className="muted">@{form.username || 'nickname'}</span>
              </div>
            </div>
          </section>

          <section className="card">
            <h3>Аватар</h3>
            <div className="actions" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 'none' }}>
              <button type="button" className="btn" onClick={() => fileRef.current.click()} disabled={busy}>
                📷 Завантажити фото
              </button>
              <button type="button" className="btn" onClick={() => upd({ avatar_url: null })} disabled={!form.avatar_url}>
                Обрати іконку
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
            {!form.avatar_url && (
              <>
                <div className="emoji-grid">
                  {EMOJIS.map((e) => (
                    <button type="button" key={e} className={form.avatar_emoji === e ? 'active' : ''} onClick={() => upd({ avatar_emoji: e })}>
                      {e}
                    </button>
                  ))}
                </div>
                <div className="color-row">
                  {COLORS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      aria-label={c}
                      className={form.avatar_color === c ? 'active' : ''}
                      style={{ background: c }}
                      onClick={() => upd({ avatar_color: c })}
                    />
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="card">
            <div className="field">
              <label>Нікнейм (за ним тебе знайдуть друзі)</label>
              <div className="prefix-input">
                <span>@</span>
                <input
                  required
                  minLength={3}
                  maxLength={20}
                  pattern="[a-zA-Z0-9_]{3,20}"
                  title="3-20 символів: латинські літери, цифри, _"
                  value={form.username}
                  onChange={(e) => upd({ username: e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() })}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>
            </div>
            <div className="field">
              <label>Ім’я (необов’язково)</label>
              <input maxLength={40} value={form.display_name} onChange={(e) => upd({ display_name: e.target.value })} placeholder="Як тебе бачитимуть друзі" />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Зачекай...' : isNew ? 'Створити профіль' : 'Зберегти'}
            </button>
            {msg && <p className={msg.ok ? 'note' : 'note bad'}>{msg.text}</p>}
          </section>
        </form>

        {!isNew && (
          <section className="card">
            <h3>Запросити друга</h3>
            <p className="muted small">Надішли посилання, і друг одразу зможе додати тебе.</p>
            <button className="btn" style={{ width: '100%' }} onClick={share}>
              🔗 Поділитися посиланням
            </button>
          </section>
        )}
      </main>
    </>
  )
}
