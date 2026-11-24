import { useState } from 'react'
import { useSocial, setBattleStatus, dismissInvite } from './social.js'
import { go } from './router.js'
import { Avatar, displayName } from './components.jsx'

// Запрошення на батл від друга - видно на будь-якому екрані
export default function InviteBanner({ route }) {
  const social = useSocial()
  const [busy, setBusy] = useState(false)
  const inv = social.invites.find((b) => !(route[0] === 'battle' && route[1] === b.id))
  if (!inv) return null

  const answer = (status) => async () => {
    setBusy(true)
    try {
      dismissInvite(inv.id)
      await setBattleStatus(inv.id, status, 'waiting')
      if (status === 'active') go('battle/' + inv.id)
    } catch {
      /* запрошення вже неактуальне */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="invite-banner" role="alert">
      <Avatar profile={inv.hostP} size={36} />
      <div className="invite-text">
        <b>{displayName(inv.hostP)}</b>
        <span>викликає тебе на батл ⚔️</span>
      </div>
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={answer('active')}>
        Прийняти
      </button>
      <button className="btn btn-sm" disabled={busy} onClick={answer('declined')} aria-label="Відхилити">
        ✕
      </button>
    </div>
  )
}
