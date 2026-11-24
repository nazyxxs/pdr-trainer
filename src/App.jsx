import { useEffect, useState } from 'react'
import { loadData } from './data.js'
import { useStore } from './store.js'
import { useRoute } from './router.js'
import Home from './screens/Home.jsx'
import Topics from './screens/Topics.jsx'
import Topic from './screens/Topic.jsx'
import Practice from './screens/Practice.jsx'
import Exam from './screens/Exam.jsx'
import Stats from './screens/Stats.jsx'
import Settings from './screens/Settings.jsx'
import Account from './screens/Account.jsx'
import Profile from './screens/Profile.jsx'
import PublicProfile from './screens/PublicProfile.jsx'
import Friends from './screens/Friends.jsx'
import Battle from './screens/Battle.jsx'
import InviteBanner from './InviteBanner.jsx'

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const st = useStore()
  const route = useRoute()

  useEffect(() => {
    loadData().then(setData).catch(setError)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = st.settings.theme
  }, [st.settings.theme])

  if (error) return <div className="page center">Не вдалося завантажити базу питань 😕</div>
  if (!data) return <div className="page center loading">Завантаження бази питань...</div>

  const [screen, ...args] = route
  const key = route.join('/') + '|' + st.settings.category
  const page = (() => {
  switch (screen) {
      case 'topics':
        return <Topics data={data} st={st} />
      case 'topic':
        return <Topic data={data} st={st} id={Number(args[0])} />
      case 'practice':
        return <Practice key={key} data={data} mode={args[0]} args={args.slice(1)} />
      case 'exam':
        return <Exam key={key} data={data} />
      case 'stats':
        return <Stats data={data} st={st} />
      case 'profile':
        return <Profile />
      case 'friends':
        return <Friends />
      case 'u':
      case 'add':
        return <PublicProfile key={args[0]} username={decodeURIComponent(args[0] || '')} />
      case 'battle':
        return <Battle key={args[0]} data={data} id={args[0]} />
      case 'account':
        return <Account />
      case 'settings':
        return <Settings st={st} />
      default:
        return <Home data={data} st={st} />
    }
  })()
  return (
    <>
      <InviteBanner route={route} />
      {page}
    </>
  )
}
