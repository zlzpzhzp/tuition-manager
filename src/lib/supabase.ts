import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
  )
}

// 네트워크 일시 장애(DNS 지연, TLS 재협상, ECONNRESET)로 undici fetch가 "TypeError: fetch failed"
// 떨어지면 납부 페이지가 통째로 까만 에러 바운더리로 돌아감. 최대 3회 단발 재시도로 복구.
const retryFetch: typeof fetch = async (input, init) => {
  const MAX_ATTEMPTS = 3
  let lastErr: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fetch(input, init)
    } catch (err) {
      lastErr = err
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise(r => setTimeout(r, 200 * (attempt + 1)))
      }
    }
  }
  throw lastErr
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: retryFetch },
})
