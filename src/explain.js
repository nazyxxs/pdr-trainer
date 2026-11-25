// Пояснення до питань від AI (див. supabase/functions/explain)
import { supabase } from './sync.js'

const cache = new Map()
export const explanationsEnabled = !!supabase

export async function getExplanation(id) {
  if (cache.has(id)) return cache.get(id)
  // 1) вже згенероване - читаємо прямо з таблиці (швидко)
  const { data } = await supabase.from('explanations').select('text').eq('question_id', id).maybeSingle()
  let text = data?.text
  // 2) ще немає - просимо серверну функцію згенерувати
  if (!text) {
    const { data: res, error } = await supabase.functions.invoke('explain', { body: { id } })
    if (error) {
      let msg = 'Не вдалося отримати пояснення'
      try {
        const body = await error.context?.json?.()
        if (body?.error) msg = body.error
      } catch {
        /* немає тіла відповіді */
      }
      throw new Error(msg)
    }
    text = res?.text
  }
  if (!text) throw new Error('Пояснення порожнє')
  cache.set(id, text)
  return text
}

export async function reportExplanation(id) {
  const { data: s } = await supabase.auth.getSession()
  const uid = s.session?.user?.id
  if (!uid) throw new Error('Щоб надіслати скаргу, увійди в акаунт')
  const { error } = await supabase.from('explanation_reports').insert({ question_id: id, user_id: uid })
  if (error && error.code !== '23505') throw new Error(error.message)
}
