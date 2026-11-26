import { useRef, useState } from 'react'
import { go } from './router.js'
import { explanationsEnabled, getExplanation, reportExplanation } from './explain.js'

export function Header({ title, back = '', right = null, confirmLeave = null }) {
  return (
    <header className="topbar">
      {back !== null ? (
        <button className="icon-btn" onClick={() => (!confirmLeave || window.confirm(confirmLeave)) && go(back)} aria-label="Назад">
          ←
        </button>
      ) : (
        <span className="logo">ПДР</span>
      )}
      <h1>{title}</h1>
      <div className="topbar-right">{right}</div>
    </header>
  )
}

export function Ring({ pct, size = 120, stroke = 10, label }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="ring-fg"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-label">
        <b>{pct}%</b>
        {label && <span>{label}</span>}
      </div>
    </div>
  )
}

export function Bar({ value, seen = 0 }) {
  return (
    <div className="bar" title={`Засвоєно ${value}%, переглянуто ${seen}%`}>
      <div className="bar-seen" style={{ width: `${seen}%` }} />
      <div className="bar-fill" style={{ width: `${value}%` }} />
    </div>
  )
}

export function QuestionView({ q, selected, reveal, onSelect, number, total }) {
  const [zoom, setZoom] = useState(false)
  return (
    <div className="question">
      {number != null && (
        <div className="q-meta">
          Питання {number} з {total} <span className="muted">· розділ {q.s}, №{q.n}</span>
        </div>
      )}
      <h2 className="q-text">{q.q}</h2>
      {q.img && (
        <>
          <img className="q-img" src={'./' + q.img} alt="Ілюстрація до питання" loading="lazy" onClick={() => setZoom(true)} onError={(e) => (e.currentTarget.style.display = 'none')} />
          {zoom && (
            <div className="zoom" onClick={() => setZoom(false)}>
              <img src={'./' + q.img} alt="" />
            </div>
          )}
        </>
      )}
      <div className="options">
        {q.o.map((text, i) => {
          let cls = 'option'
          if (reveal) {
            if (i === q.a) cls += ' correct'
            else if (i === selected) cls += ' wrong'
            else cls += ' dim'
          } else if (i === selected) cls += ' selected'
          return (
            <button key={i} className={cls} onClick={() => onSelect(i)} disabled={reveal}>
              <span className="opt-num">{i + 1}</span>
              <span>{text}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Свайп по питанню: пальцем вліво - наступне, вправо - попереднє.
// Дотики біля самого краю екрана ігноруємо, щоб не заважати жесту "назад" у браузері.
export function useSwipe(onNext, onPrev) {
  const start = useRef(null)
  return {
    onTouchStart(e) {
      const t = e.touches[0]
      const edge = 24
      start.current = t.clientX < edge || t.clientX > window.innerWidth - edge ? null : { x: t.clientX, y: t.clientY }
    },
    onTouchEnd(e) {
      if (!start.current) return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.current.x
      const dy = t.clientY - start.current.y
      start.current = null
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return
      if (dx < 0) onNext?.()
      else onPrev?.()
    },
  }
}

// Плавна поява питання з того боку, куди гортаємо
export function Slide({ index, children }) {
  const ref = useRef({ index, dir: 'next' })
  if (ref.current.index !== index) ref.current = { index, dir: index > ref.current.index ? 'next' : 'prev' }
  return (
    <div key={index} className={'slide slide-' + ref.current.dir}>
      {children}
    </div>
  )
}

// Аватар: фото або іконка на кольоровому фоні
export function Avatar({ profile, size = 44 }) {
  const style = { width: size, height: size, fontSize: size * 0.5 }
  if (profile?.avatar_url) return <img className="avatar" style={style} src={profile.avatar_url} alt="" />
  return (
    <span className="avatar" style={{ ...style, background: profile?.avatar_color || '#64748b' }}>
      {profile?.avatar_emoji || '🙂'}
    </span>
  )
}

export const displayName = (p) => (p ? p.display_name || p.username : '...')

// Кнопка "Чому так?" і пояснення від AI
export function Explanation({ id }) {
  const [state, setState] = useState({ status: 'idle' })
  const [reported, setReported] = useState(false)
  if (!explanationsEnabled) return null

  const load = async () => {
    setState({ status: 'loading' })
    try {
      setState({ status: 'ok', text: await getExplanation(id) })
    } catch (e) {
      setState({ status: 'error', text: e.message })
    }
  }
  const report = async () => {
    try {
      await reportExplanation(id)
      setReported(true)
    } catch (e) {
      setState((s) => ({ ...s, note: e.message }))
    }
  }

  if (state.status === 'idle')
    return (
      <button className="btn explain-btn" onClick={load}>
        💡 Чому так?
      </button>
    )
  return (
    <div className="explain">
      {state.status === 'loading' && <p className="muted">💡 Думаю над поясненням...</p>}
      {state.status === 'error' && (
        <p className="note bad">
          {state.text}{' '}
          <button className="link-btn" onClick={load}>
            Спробувати ще
          </button>
        </p>
      )}
      {state.status === 'ok' && (
        <>
          <p className="explain-text">{state.text}</p>
          <div className="explain-foot">
            <span>🤖 Пояснення від AI, може містити неточності</span>
            {reported ? (
              <span>Дякую, скаргу надіслано</span>
            ) : (
              <button className="link-btn" onClick={report}>
                ⚠️ Тут помилка
              </button>
            )}
          </div>
          {state.note && <p className="note bad">{state.note}</p>}
        </>
      )}
    </div>
  )
}
