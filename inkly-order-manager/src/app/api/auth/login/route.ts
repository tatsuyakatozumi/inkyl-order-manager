import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

function generateSessionToken(): string {
  const secret = process.env.ENCRYPTION_KEY || 'fallback';
  return crypto.createHmac('sha256', secret).update('admin_session').digest('hex');
}

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json(
      { error: 'ADMIN_PASSWORD not configured' },
      { status: 500 },
    );
  }

  if (password !== adminPassword) {
    return NextResponse.json(
      { error: 'Invalid password' },
      { status: 401 },
    );
  }

  const token = generateSessionToken();
  const response = NextResponse.json({ success: true });

  response.cookies.set('admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return response;
}
