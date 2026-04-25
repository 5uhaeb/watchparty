import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ message: 'NEXT_PUBLIC_API_URL is not configured.' }, { status: 500 });
  }

  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/extension/token`, {
    method: 'POST',
    headers: {
      cookie: request.headers.get('cookie') || '',
    },
    credentials: 'include',
  });

  const body = await response.json().catch(() => ({ message: 'Could not refresh extension token.' }));
  return NextResponse.json(body, { status: response.status });
}
