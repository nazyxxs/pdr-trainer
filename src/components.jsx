import { useState } from 'react'
import { go } from './router.js'

export function Header({ title, back = '', right = null }) {
  return (
    <header className="topbar">
      {back !== null ? (
        <button className="icon-btn" onClick={() => go(back)} aria-label="Назад">
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
