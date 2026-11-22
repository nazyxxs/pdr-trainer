import { useState } from 'react'
import { CATEGORIES } from '../data.js'
import { store } from '../store.js'
import { Header } from '../components.jsx'
import { go } from '../router.js'
import { useSync } from '../sync.js'

export default function Settings({ st }) {
  const sync = useSync()
  const [msg, setMsg] = useState('')
  const [importText, setImportText] = useState('')

  const exportFile = () => {
    const blob = new Blob([store.export()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pdr-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(store.export())
      setMsg('Прогрес скопійовано. Встав його на іншому пристрої в поле нижче.')
    } catch {
      setMsg('Не вдалося скопіювати, скористайся кнопкою "Зберегти файл".')
    }
  }
  const doImport = (text) => {
    try {
      store.import(text)
      setMsg('Прогрес імпортовано і об’єднано з поточним ✓')
      setImportText('')
    } catch {
      setMsg('Не вдалося прочитати дані. Перевір, що скопійовано повністю.')
    }
  }
  const onFile = (e) => {
    const f = e.target.files?.[0]
    if (f) f.text().then(doImport)
  }

  return (
    <>
      <Header title="Налаштування" />
      <main className="page">
        <section className="card">
          <h3>Категорія</h3>
          <div className="cat-grid">
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <button key={k} className={'cat' + (st.settings.category === k ? ' active' : '')} onClick={() => store.setSettings({ category: k })}>
                <b>{c.label}</b>
                <span>{c.title}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <h3>Тема оформлення</h3>
          <div className="seg">
            {[
              ['auto', 'Як у системі'],
              ['light', 'Світла'],
              ['dark', 'Темна'],
            ].map(([k, l]) => (
              <button key={k} className={st.settings.theme === k ? 'active' : ''} onClick={() => store.setSettings({ theme: k })}>
                {l}
              </button>
            ))}
          </div>
        </section>

        {sync.configured && (
          <section className="card">
            <h3>Акаунт</h3>
            <p className="muted small">{sync.user ? `Ти увійшов як ${sync.user.email}. Прогрес синхронізується автоматично.` : 'Увійди, щоб прогрес був однаковий на телефоні й ноутбуці.'}</p>
            <button className="btn btn-primary" onClick={() => go('account')}>
              {sync.user ? 'Керувати акаунтом' : 'Увійти або зареєструватися'}
            </button>
          </section>
        )}

        <section className="card">
          <h3>Перенести прогрес вручну (без акаунта)</h3>
          <p className="muted small">Прогрес зберігається в цьому браузері. Щоб продовжити на телефоні чи ноутбуці, збережи його тут і відкрий там. Дані об’єднуються, нічого не зітреться.</p>
          <div className="actions">
            <button className="btn" onClick={exportFile}>
              Зберегти файл
            </button>
            <button className="btn" onClick={copy}>
              Скопіювати як текст
            </button>
            <label className="btn">
              Завантажити файл
              <input type="file" accept="application/json,.json" onChange={onFile} hidden />
            </label>
          </div>
          <textarea className="import" placeholder="...або встав сюди скопійований текст" value={importText} onChange={(e) => setImportText(e.target.value)} />
          <button className="btn btn-primary" disabled={!importText.trim()} onClick={() => doImport(importText)}>
            Імпортувати
          </button>
          {msg && <p className="note">{msg}</p>}
        </section>

        <section className="card">
          <h3>Скинути прогрес</h3>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm('Видалити весь прогрес і історію іспитів? Це не можна скасувати.')) store.reset()
            }}
          >
            Скинути все
          </button>
        </section>
      </main>
    </>
  )
}
