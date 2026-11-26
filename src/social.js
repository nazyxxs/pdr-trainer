// Профілі, друзі та батли (Supabase). Схема бази: supabase/social.sql
import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase, onSynced } from './sync.js'
import { store, streakInfo, statsFor } from './store.js'
import { loadData, questionsForCategory, makeExamTicket } from './data.js'

export const BATTLE_LIMIT = 10 * 60 // секунд на батл
export const BATTLE_COUNTDOWN = 3 // відлік 3-2-1 перед стартом
const INVITE_TTL = 10 * 60 * 1000 // запрошення на батл діє 10 хвилин

// ---------- мій профіль ----------
let me = { userId: null, profile: null, loaded: false, invites: [], incomingRequests: 0 }
const listeners = new Set()
const set = (patch) => {
  me = { ...me, ...patch }
  listeners.forEach((l) => l())
}
export const useSocial = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => me,
  )

export async function refreshMyProfile() {
  if (!me.userId) return null
  const { data } = await supabase.from('profiles').select('*').eq('id', me.userId).maybeSingle()
  set({ profile: data, loaded: true })
  return data
}

const ERR = {
  23505: 'Цей нікнейм уже зайнятий',
  23514: 'Нікнейм: 3-20 символів, лише латинські літери, цифри та _',
}
const fail = (error) => {
  throw new Error(ERR[error.code] || error.message)
}

export async function saveProfile(patch) {
  const row = { id: me.userId, ...patch, updated_at: new Date().toISOString() }
  const { data, error } = await supabase.from('profiles').upsert(row).select().single()
  if (error) fail(error)
  set({ profile: data })
  publishStats(true)
  return data
}

// фото стискаємо до 256x256 у браузері, щоб не зберігати великі файли
async function resizeImage(file, size = 256) {
  const bmp = await createImageBitmap(file)
  const s = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  canvas.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size)
  return new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
}

export async function uploadAvatar(file) {
  const blob = await resizeImage(file)
  const path = `${me.userId}/avatar.jpg`
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
  if (error) throw new Error('Не вдалося завантажити фото: ' + error.message)
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}` // ?v - щоб браузер не показував старе фото з кешу
}

// публічна статистика для рейтингу друзів
// Після кожної синхронізації - не частіше ніж раз на хвилину (щоб не робити зайвих запитів),
// після батлу чи зміни профілю - одразу (force).
let publishTimer = null
let lastPublish = 0
export function publishStats(force = false) {
  if (!force && Date.now() - lastPublish < 60 * 1000) return
  clearTimeout(publishTimer)
  publishTimer = setTimeout(async () => {
    if (!me.userId || !me.profile) return
    lastPublish = Date.now()
    const st = store.get()
    const data = await loadData()
    const s = statsFor(questionsForCategory(data, st.settings.category), st.q)
    const streak = streakInfo(st)
    const { count: wins } = await supabase.from('battles').select('id', { count: 'exact', head: true }).eq('winner', me.userId)
    const stats = {
      streak: streak.streak,
      best: streak.best,
      pct: s.pct,
      mastered: s.mastered,
      seen: s.seen,
      examsPassed: st.exams.filter((e) => e.passed).length,
      exams: st.exams.length,
      wins: wins || 0,
      category: st.settings.category,
      t: Date.now(),
    }
    await supabase.from('profiles').update({ stats }).eq('id', me.userId)
  }, 1500)
}

// ---------- профілі інших ----------
export async function getProfileByUsername(username) {
  const { data } = await supabase.from('profiles').select('*').eq('username', username.toLowerCase()).maybeSingle()
  return data
}

export async function searchProfiles(q) {
  const clean = q.toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (clean.length < 2) return []
  const { data } = await supabase.from('profiles').select('*').ilike('username', `${clean}%`).neq('id', me.userId).limit(10)
  return data || []
}

export const inviteLink = (username) => `${window.location.origin}${window.location.pathname}#/add/${username}`

// ---------- друзі ----------
const FR_SELECT = 'id,status,requester,addressee,created_at,req:profiles!friendships_requester_fkey(*),adr:profiles!friendships_addressee_fkey(*)'

// усі мої зв'язки: { friends, incoming, outgoing }, у кожного є .other - профіль другої людини
export async function listFriendships() {
  const { data, error } = await supabase.from('friendships').select(FR_SELECT)
  if (error) fail(error)
  const rows = (data || []).map((f) => ({ ...f, other: f.requester === me.userId ? f.adr : f.req }))
  const res = {
    friends: rows.filter((f) => f.status === 'accepted'),
    incoming: rows.filter((f) => f.status === 'pending' && f.addressee === me.userId),
    outgoing: rows.filter((f) => f.status === 'pending' && f.requester === me.userId),
  }
  set({ incomingRequests: res.incoming.length })
  return res
}

export async function friendshipWith(otherId) {
  const { data } = await supabase
    .from('friendships')
    .select('*')
    .or(`and(requester.eq.${me.userId},addressee.eq.${otherId}),and(requester.eq.${otherId},addressee.eq.${me.userId})`)
    .maybeSingle()
  return data
}

export async function sendFriendRequest(otherId) {
  const { error } = await supabase.from('friendships').insert({ requester: me.userId, addressee: otherId })
  if (error && error.code !== '23505') fail(error)
}
export async function acceptFriend(id) {
  const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id)
  if (error) fail(error)
}
export async function removeFriendship(id) {
  const { error } = await supabase.from('friendships').delete().eq('id', id)
  if (error) fail(error)
}

// ---------- батли ----------
const BATTLE_SELECT = '*,hostP:profiles!battles_host_fkey(*),guestP:profiles!battles_guest_fkey(*)'

export async function createBattle(guestId) {
  const data = await loadData()
  const cat = store.get().settings.category
  const ids = makeExamTicket(data, cat).map((q) => q.id)
  const { data: b, error } = await supabase
    .from('battles')
    .insert({ host: me.userId, guest: guestId, category: cat, question_ids: ids })
    .select('id')
    .single()
  if (error) throw new Error(error.code === '42501' ? 'Батл можна почати лише з другом' : error.message)
  return b.id
}

export async function getBattle(id) {
  const { data, error } = await supabase.from('battles').select(BATTLE_SELECT).eq('id', id).maybeSingle()
  if (error) fail(error)
  return data
}

export async function getBattleAnswers(id) {
  const { data } = await supabase.from('battle_answers').select('*').eq('battle_id', id)
  return data || []
}

export async function setBattleStatus(id, status, from) {
  let q = supabase.from('battles').update({ status }).eq('id', id)
  if (from) q = q.eq('status', from)
  const { error } = await q
  if (error) fail(error)
}

// відповідь у батлі: кілька спроб, якщо зв'язок на мить пропав
export async function submitBattleAnswer(battleId, index, answer, correct) {
  let lastError = null
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error } = await supabase
      .from('battle_answers')
      .insert({ battle_id: battleId, user_id: me.userId, q_index: index, answer, correct })
    if (!error || error.code === '23505') return // 23505 - вже записано
    lastError = error
    if (error.code === '42501') break // батл уже завершено - повтор не допоможе
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
  }
  fail(lastError)
}

// Різниця між годинником пристрою і сервера: щоб відлік батлу був однаковим у обох гравців,
// навіть якщо на телефоні неточний час. Потребує функції server_now() (supabase/social.sql).
let clockOffset = null
export async function serverClockOffset() {
  if (clockOffset !== null) return clockOffset
  try {
    const t0 = Date.now()
    const { data, error } = await supabase.rpc('server_now')
    const t1 = Date.now()
    clockOffset = error || !data ? 0 : new Date(data).getTime() - (t0 + t1) / 2
  } catch {
    clockOffset = 0
  }
  return clockOffset
}

// підсумок: більше правильних - перемога; порівну - швидший; повністю порівну - нічия
export function battleScore(battle, answers) {
  const side = (uid) => {
    const mine = answers.filter((a) => a.user_id === uid)
    return {
      answered: mine.length,
      correct: mine.filter((a) => a.correct).length,
      last: mine.reduce((m, a) => Math.max(m, new Date(a.answered_at).getTime()), 0),
    }
  }
  const h = side(battle.host)
  const g = side(battle.guest)
  let winner = null
  if (h.correct !== g.correct) winner = h.correct > g.correct ? battle.host : battle.guest
  else if (h.answered === 20 && g.answered === 20 && h.last !== g.last) winner = h.last < g.last ? battle.host : battle.guest
  return { host: h, guest: g, winner }
}

export async function finishBattle(battle, answers) {
  const s = battleScore(battle, answers)
  await supabase
    .from('battles')
    .update({ status: 'finished', winner: s.winner, host_score: s.host.correct, guest_score: s.guest.correct })
    .eq('id', battle.id)
    .eq('status', 'active')
  publishStats(true)
}

export async function battlesWith(otherId) {
  const { data } = await supabase
    .from('battles')
    .select('*')
    .eq('status', 'finished')
    .or(`and(host.eq.${me.userId},guest.eq.${otherId}),and(host.eq.${otherId},guest.eq.${me.userId})`)
    .order('created_at', { ascending: false })
    .limit(20)
  return data || []
}

// ---------- живі оновлення ----------
// Підписка на зміни в таблиці + періодичне опитування як запасний варіант
export function useLive(fetcher, deps, { table, filter, every = 15000 }) {
  const [value, setValue] = useState(undefined)
  useEffect(() => {
    if (!supabase || deps.some((d) => d === undefined || d === null)) return
    let alive = true
    const load = () => fetcher().then((v) => alive && setValue(v)).catch(() => {})
    load()
    const ch = supabase
      .channel(`${table}-${filter}-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter }, load)
      .subscribe()
    const timer = setInterval(load, every)
    return () => {
      alive = false
      clearInterval(timer)
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return value
}

// вхідні запрошення на батл - показуються банером на будь-якому екрані
let inviteChannel = null
let inviteTimer = null
async function loadInvites() {
  if (!me.userId) return
  const since = new Date(Date.now() - INVITE_TTL).toISOString()
  const { data } = await supabase
    .from('battles')
    .select(BATTLE_SELECT)
    .eq('guest', me.userId)
    .eq('status', 'waiting')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
  set({ invites: data || [] })
}

async function loadIncomingCount() {
  if (!me.userId) return
  const { count } = await supabase
    .from('friendships')
    .select('id', { count: 'exact', head: true })
    .eq('addressee', me.userId)
    .eq('status', 'pending')
  set({ incomingRequests: count || 0 })
}

function startListening() {
  stopListening()
  loadInvites()
  loadIncomingCount()
  inviteChannel = supabase
    .channel('my-invites-' + me.userId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'battles', filter: `guest=eq.${me.userId}` }, loadInvites)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `addressee=eq.${me.userId}` }, loadIncomingCount)
    .subscribe()
  inviteTimer = setInterval(() => {
    loadInvites()
    loadIncomingCount()
  }, 20000)
}
function stopListening() {
  if (inviteChannel) supabase.removeChannel(inviteChannel)
  clearInterval(inviteTimer)
  inviteChannel = null
}

export function dismissInvite(id) {
  set({ invites: me.invites.filter((b) => b.id !== id) })
}

export function initSocial() {
  if (!supabase) return
  const onUser = (user) => {
    if (user?.id === me.userId) return
    set({ userId: user?.id ?? null, profile: null, loaded: !user, invites: [], incomingRequests: 0 })
    if (user) {
      refreshMyProfile()
      startListening()
    } else stopListening()
  }
  supabase.auth.getSession().then(({ data }) => onUser(data.session?.user))
  supabase.auth.onAuthStateChange((_e, session) => onUser(session?.user))
  onSynced(publishStats)
}
