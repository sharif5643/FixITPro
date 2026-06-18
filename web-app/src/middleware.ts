import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// CHB-01: routes accessible without an access_token cookie
const PUBLIC_PATHS = [
  '/login', '/403', '/sunmi-health',
  // Public website routes
  '/register', '/features', '/pricing', '/billing', '/contact', '/about',
]

// Routes that are the public website root (exact match)
const PUBLIC_EXACT = ['/']

const GRACE_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export function middleware(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value
  const { pathname } = request.nextUrl

  const isPublic =
    PUBLIC_EXACT.includes(pathname) ||
    PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  // No cookie on a protected route → send to login
  if (!token && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Already authenticated and trying to hit login → send to dashboard
  if (token && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Role-based routing checks
  if (token && !isPublic) {
    const role = request.cookies.get('tenant_role')?.value
    const expiryTs = request.cookies.get('tenant_expiry_ts')?.value

    // SUPER_ADMIN must stay in /super-admin/* — redirect if they land on an owner-portal route
    const SA_EXEMPT = ['/super-admin', '/change-password', '/billing', '/403']
    if (
      role === 'SUPER_ADMIN' &&
      !SA_EXEMPT.some((p) => pathname.startsWith(p))
    ) {
      return NextResponse.redirect(new URL('/super-admin', request.url))
    }

    // Expired-after-grace check: redirect to /billing if tenant is fully expired
    if (role !== 'SUPER_ADMIN' && expiryTs) {
      const expiryMs = parseInt(expiryTs, 10)
      if (!isNaN(expiryMs) && Date.now() > expiryMs + GRACE_DAYS_MS) {
        return NextResponse.redirect(new URL('/billing', request.url))
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  // Run on all app routes; skip Next.js internals, static assets, and the
  // health page (which is also in PUBLIC_PATHS as belt-and-suspenders).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads|sunmi-health).*)'],
}
