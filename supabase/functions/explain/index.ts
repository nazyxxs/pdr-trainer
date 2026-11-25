// Supabase Edge Function "explain": пояснення до питання ПДР від AI (Google Gemini).
// Кожне питання генерується лише один раз і зберігається в таблиці explanations.
// Текст питання береться з офіційної бази на сайті, а не з запиту,
// тож підсунути вигадане питання й закешувати його для всіх неможливо.
//
// Секрети (Edge Functions -> Secrets):
//   GEMINI_API_KEY - ключ Google AI Studio (AIza...) або Vertex AI (AQ....)
//   GEMINI_MODEL   - необов'язково, за замовчуванням gemini-2.5-flash
//   SITE_URL       - необов'язково, за замовчуванням https://nazyxxs.github.io/pdr-trainer/
import { createClient } from 'npm:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'

const SITE = (Deno.env.get('SITE_URL') ?? 'https://nazyxxs.github.io/pdr-trainer/').replace(/\/?$/, '/')
const KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type Q = { id: string; q: string; o: string[]; a: number; img: string | null }
let questions: Map<string, Q> | null = null
async function getQuestion(id: string) {
  if (!questions) {
    const res = await fetch(SITE + 'questions.json')
    const data = await res.json()
    questions = new Map(data.questions.map((q: Q) => [q.id, q]))
  }
  return questions.get(id)
}

// ключі AI Studio починаються з AIza, ключі Vertex AI (express mode) - з AQ.
const endpoint = () =>
  KEY.startsWith('AIza')
    ? `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`
    : `https://aiplatform.googleapis.com/v1/publishers/google/models/${MODEL}:generateContent?key=${KEY}`

function prompt(q: Q) {
  const options = q.o.map((o, i) => `${i + 1}) ${o}`).join('\n')
  return `Ти досвідчений інструктор автошколи в Україні. Учень готується до теоретичного іспиту з ПДР.
Поясни коротко (3-5 речень) і простою українською мовою, чому правильна відповідь саме така.
Спирайся на чинні Правила дорожнього руху України. Номер пункту ПДР або дорожнього знака називай,
лише якщо цілком у ньому впевнений, інакше не вигадуй номерів. Одним-двома реченнями поясни,
чому інші варіанти неправильні. Без вступу, без заголовків і без markdown-розмітки.
${q.img ? '\nДо питання є зображення (додано нижче), враховуй його.\n' : ''}
Питання: ${q.q}
Варіанти:
${options}
Правильна відповідь (офіційна): ${q.a + 1}) ${q.o[q.a]}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { id } = await req.json()
    if (typeof id !== 'string' || !/^\d+-\d+$/.test(id)) return json({ error: 'Невірний id питання' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: cached } = await admin.from('explanations').select('text').eq('question_id', id).maybeSingle()
    if (cached) return json({ text: cached.text, cached: true })

    if (!KEY) return json({ error: 'На сервері не задано GEMINI_API_KEY' }, 500)
    const q = await getQuestion(id)
    if (!q) return json({ error: 'Питання не знайдено' }, 404)

    const parts: unknown[] = [{ text: prompt(q) }]
    if (q.img) {
      const img = await fetch(SITE + q.img)
      if (img.ok) parts.push({ inlineData: { mimeType: 'image/jpeg', data: encodeBase64(new Uint8Array(await img.arrayBuffer())) } })
    }

    const ai = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      }),
    })
    if (!ai.ok) {
      const detail = (await ai.text()).slice(0, 400)
      console.error('AI error', ai.status, detail)
      return json({ error: `AI відповів помилкою ${ai.status}`, detail }, 502)
    }
    const out = await ai.json()
    const text = (out.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? '')
      .join('')
      .trim()
    if (!text) return json({ error: 'AI повернув порожню відповідь' }, 502)

    await admin.from('explanations').upsert({ question_id: id, text, model: MODEL })
    return json({ text, cached: false })
  } catch (e) {
    console.error(e)
    return json({ error: String(e) }, 500)
  }
})
