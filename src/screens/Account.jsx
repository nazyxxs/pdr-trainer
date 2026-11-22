import { useState } from 'react'
import { useSync, signIn, signUp, signOut, syncNow } from '../sync.js'
import { Header } from '../components.jsx'

const STATE_TEXT = {
  idle: 'Очікування',
  syncing: 'Синхронізація...',
  synced: 'Усе синхронізовано ✓',
  error: 'Помилка синхронізації',
  offline: 'Немає інтернету - синхронізую, коли з’явиться',
}

export default function Account() {
  const sync = useSync()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(false)

  if (!sync.configured) {
    return (
      <>
        <Header title="Акаунт" />
        <main className="page">
          <section className="card">
            <h3>Акаунти ще не налаштовані</h3>
            <p className="muted">
              Додай ключі Supabase у файл <code>.env.local</code> (інструкція в README), і тут з’явиться вхід.
            </p>
          </section>
        </main>
      </>
    )
  }

  if (sync.user) {
    return (
      <>
        <Header title="Акаунт" />
        <main className="page">
          <section className="card">
            <h3>Ти увійшов як</h3>
            <p className="account-email">{sync.user.email}</p>
            <p className={'sync-state ' + sync.state}>{STATE_TEXT[sync.state]}</p>
            {sync.lastSync && <p className="muted small">Остання синхронізація: {new Date(sync.lastSync).toLocaleTimeString('uk-UA')}</p>}
            {sync.error && sync.state === 'error' && <p className="note">{sync.error}</p>}
            <p className="muted small">Прогрес автоматично зберігається на сервері. Увійди з тим самим email на телефоні чи ноутбуці, і прогрес буде однаковий.</p>
            <div className="actions">
              <button className="btn" onClick={syncNow} disabled={sync.state === 'syncing'}>
                Синхронізувати зараз
              </button>
              <button className="btn btn-danger" onClick={signOut}>
                Вийти
              </button>
            </div>
          </section>
        </main>
      </>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMsg(null)
    try {
      if (mode === 'login') await signIn(email.trim(), password)
      else {
        const { needsConfirm } = await signUp(email.trim(), password)
        if (needsConfirm) setMsg({ ok: true, text: 'Готово! Ми надіслали лист на пошту - підтверди її і увійди.' })
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Header title="Акаунт" />
      <main className="page">
        <section className="card">
          <div className="seg">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
              Вхід
            </button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
              Реєстрація
            </button>
          </div>
          <form className="auth-form" onSubmit={submit}>
            <input type="email" placeholder="Email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <input
              type="password"
              placeholder="Пароль (від 6 символів)"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn btn-primary" disabled={loading}>
              {loading ? 'Зачекай...' : mode === 'login' ? 'Увійти' : 'Створити акаунт'}
            </button>
          </form>
          {msg && <p className={msg.ok ? 'note' : 'note bad'}>{msg.text}</p>}
          <p className="muted small">Прогрес, який уже є на цьому пристрої, не пропаде - після входу він об’єднається з акаунтом.</p>
        </section>
      </main>
    </>
  )
}
