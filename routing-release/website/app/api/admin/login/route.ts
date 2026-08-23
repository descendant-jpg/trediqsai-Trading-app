import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  isAdminAuthConfigured,
  verifyAdminPassword,
} from '../../../../lib/admin-auth';
import {
  clearLoginAttempts,
  clearGlobalLoginAttempts,
  getClientIp,
  isLoginBlocked,
  isGlobalLoginBlocked,
  recordFailedLogin,
  recordGlobalFailedLogin,
} from '../../../../lib/admin-rate-limit';

/** This route touches the database, so it must not be statically optimised. */
export const dynamic = 'force-dynamic';

const TOO_MANY_ATTEMPTS = 'Too many attempts. Please try again later.';

/**
 * Shown when the global limit is hit so operators can distinguish a distributed
 * brute-force attack from an individual IP lockout in server logs / alerts.
 */
const TOO_MANY_GLOBAL_ATTEMPTS =
  'Too many failed sign-in attempts from multiple locations. Please try again later.';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  // Per-IP check: stops a single address from making many guesses.
  // Attempts are counted in Postgres, so a lockout survives a restart or
  // redeploy and applies across every running instance.
  if (await isLoginBlocked(ip)) {
    return NextResponse.json({ error: TOO_MANY_ATTEMPTS }, { status: 429 });
  }

  // Global check: stops an attacker who spreads guesses across a pool of
  // addresses (botnet, VPN rotation, IPv6) from exceeding the total budget
  // even though no single IP tripped the per-IP cap.
  if (await isGlobalLoginBlocked()) {
    return NextResponse.json({ error: TOO_MANY_GLOBAL_ATTEMPTS }, { status: 429 });
  }

  if (!isAdminAuthConfigured()) {
    console.warn('[admin-auth] ADMIN_PASSWORD or SESSION_SECRET is not configured.');
    return NextResponse.json(
      { error: 'Admin access is not configured on this server.' },
      { status: 503 },
    );
  }

  let email = '';
  let password = '';
  try {
    const body = await req.json();
    email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (email !== 'nextgensynthex@gmail.com' || !verifyAdminPassword(password)) {
    // Only wrong passwords count against the limit — both per-IP and global.
    const [nowBlockedIp, nowBlockedGlobal] = await Promise.all([
      recordFailedLogin(ip),
      recordGlobalFailedLogin(),
    ]);

    if (nowBlockedGlobal) {
      return NextResponse.json({ error: TOO_MANY_GLOBAL_ATTEMPTS }, { status: 429 });
    }
    return nowBlockedIp
      ? NextResponse.json({ error: TOO_MANY_ATTEMPTS }, { status: 429 })
      : NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  const token = await createSessionToken();
  if (!token) {
    return NextResponse.json(
      { error: 'Admin access is not configured on this server.' },
      { status: 503 },
    );
  }

  // A correct password wipes both counters, so an admin who got the right
  // password in after an attacker was flooding starts the next window clean.
  await Promise.all([clearLoginAttempts(ip), clearGlobalLoginAttempts()]);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
