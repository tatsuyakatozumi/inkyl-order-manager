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
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/'],
};
