import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';

async function createExtensionToken() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ message: 'Sign in first' }, { status: 401 });
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/extension/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-extension-internal-secret': process.env.EXTENSION_INTERNAL_SECRET || '',
    },
    body: JSON.stringify({
      email,
      name: session.user?.name || email,
    }),
    cache: 'no-store',
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(payload, { status: res.status });
  }

  return NextResponse.json(payload);
}

export async function GET() {
  return createExtensionToken();
}

export async function POST() {
  return createExtensionToken();
}
