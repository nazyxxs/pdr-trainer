// Акаунти і синхронізація прогресу через Supabase.
// Дані кожного користувача - один рядок у таблиці `progress` (jsonb).
// Доступ захищено Row Level Security: користувач бачить лише свій рядок.
import { createClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { store } from './store.js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = URL && KEY ? createClient(URL, KEY) : null

// ---- стан синхронізації для інтерфейсу ----
let status = { configured: !!supabase, user: null, state: 'idle', lastSync: null, error: null, recovery: false }
const listeners = new Set()
const set = (patch) => {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}
export const useSync = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
  )

// інші модулі можуть виконати щось після вдалої синхронізації
const afterSync = new Set()
export const onSynced = (fn) => afterSync.add(fn)

// ---- робота з сервером ----
async function pull() {
  const { data, error } = await supabase.from('progress').select('data').eq('user_id', status.user.id).maybeSingle()
  if (error) throw error
  if (data?.data) store.merge(data.data)
}

async function push() {
  const { error } = await supabase
    .from('progress')
    .upsert({ user_id: status.user.id, data: store.get(), updated_at: new Date().toISOString() })
  if (error) throw error
}

let busy = false
let again = false
export async function syncNow() {
  if (!supabase || !status.user) return
  if (busy) {
    again = true
    return
  }
  busy = true
  set({ state: 'syncing', error: null })
  try {
    await pull()
    await push()
    set({ state: 'synced', lastSync: Date.now() })
    afterSync.forEach((fn) => fn())
  } catch (e) {
    set({ state: navigator.onLine ? 'error' : 'offline', error: e.message || String(e) })
  } finally {
    busy = false
    if (again) {
      again = false
      syncNow()
    }
  }
}

// після кожної зміни прогресу - відправка на сервер із затримкою
let timer = null
function schedule() {
  if (!status.user) return
  clearTimeout(timer)
  timer = setTimeout(syncNow, 2000)
}

export function initSync() {
  if (!supabase) return
  supabase.auth.getSession().then(({ data }) => {
    set({ user: data.session?.user ?? null })
    if (data.session) syncNow()
  })
  supabase.auth.onAuthStateChange((event, session) => {
    set({ user: session?.user ?? null })
    if (event === 'SIGNED_IN') syncNow()
    // користувач перейшов за посиланням з листа "відновити пароль"
    if (event === 'PASSWORD_RECOVERY') {
      set({ recovery: true })
      window.location.hash = '#/account'
    }
  })
  store.subscribe(schedule)
  // повернувся до вкладки / з'явився інтернет - підтягуємо зміни з іншого пристрою
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && syncNow())
  window.addEventListener('online', syncNow)
}

// ---- авторизація ----
const ERRORS = {
  'Invalid login credentials': 'Невірна пошта або пароль',
  'User already registered': 'Такий користувач уже є. Спробуй увійти',
  'Email not confirmed': 'Пошту ще не підтверджено. Перевір листи',
  'Password should be at least 6 characters.': 'Пароль має бути щонайменше 6 символів',
  'email rate limit exceeded': 'Забагато листів за короткий час. Спробуй через годину',
  'New password should be different from the old password.': 'Новий пароль має відрізнятися від старого',
  'Failed to fetch': 'Немає з’єднання з сервером. Перевір інтернет',
}
const tr = (e) => ERRORS[e?.message] || e?.message || 'Щось пішло не так'

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: siteUrl() },
  })
  if (error) throw new Error(tr(error))
  return { needsConfirm: !data.session }
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(tr(error))
}

export async function signOut() {
  await syncNow()
  await supabase.auth.signOut()
  set({ state: 'idle', lastSync: null })
}

// адреса сайту, куди Supabase поверне користувача з листа
const siteUrl = () => window.location.origin + window.location.pathname

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() })
  if (error) throw new Error(tr(error))
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error(tr(error))
  set({ recovery: false })
}
