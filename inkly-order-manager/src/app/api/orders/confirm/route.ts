import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Checkout functionality has been removed. Please complete checkout manually via the cart URL.' },
    { status: 410 },
  );
}
