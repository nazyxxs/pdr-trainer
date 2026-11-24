import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { initSync } from './sync.js'
import { initSocial } from './social.js'
import './styles.css'

initSync()
initSocial()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA: офлайн-кеш (тільки у зібраній версії)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}))
}

// Автооновлення: якщо вкладка довго була відкрита, а на сайті вийшла нова версія,
// перезавантажуємо сторінку. Інакше стара версія могла б синхронізувати застарілі дані.
if (import.meta.env.PROD) {
  const current = document.querySelector('script[type="module"][src*="assets/"]')?.getAttribute('src')
  const check = async () => {
    try {
      const html = await (await fetch('./index.html', { cache: 'no-store' })).text()
      const latest = html.match(/src="([^"]*assets\/[^"]+\.js)"/)?.[1]
      if (current && latest && latest !== current) window.location.reload()
    } catch {
      /* офлайн - перевіримо наступного разу */
    }
  }
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  setInterval(check, 10 * 60 * 1000)
}
