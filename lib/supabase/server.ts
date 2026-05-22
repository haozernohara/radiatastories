import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Pipeline client: service role key, no cookies.
 * Used by cron handler and lib/pipeline/* modules — never in browser context.
 */
export function createPipelineClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

/**
 * Dashboard client: anon key, cookie-backed session.
 * Used by Server Components and Route Handlers in app/.
 * IMPORTANT: cookies() is async in Next.js 15+.
 */
export async function createDashboardClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from a Server Component — writes are ignored safely
          }
        },
      },
    }
  )
}
