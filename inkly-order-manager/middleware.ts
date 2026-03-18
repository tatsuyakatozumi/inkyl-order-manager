import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';

function expectedToken(): string {
  const secret = process.env.ENCRYPTION_KEY || 'fallback';
  return crypto.createHmac('sha256', secret).update('admin_session').digest('hex');
}

export function middleware(request: NextRequest) {
  const session = request.cookies.get('admin_session')?.value;
  if (!session || session !== expectedToken()) {
    // API routes: return 401 JSON instead of redirect
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/', '/api/orders/:path*'],
};
