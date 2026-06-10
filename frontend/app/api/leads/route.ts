import { NextResponse } from 'next/server';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const source = typeof body.source === 'string' ? body.source.trim() : '';

  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }
  if (!source) {
    return NextResponse.json({ error: 'Lead source is required' }, { status: 400 });
  }

  const { email: _email, source: _source, ...payload } = body;

  const lead = {
    email,
    source,
    payload,
    createdAt: new Date().toISOString(),
    userAgent: request.headers.get('user-agent') ?? undefined,
  };

  // Pilot: log for ops / CRM handoff. Wire to MailService or CRM when ready.
  console.info('[lead]', JSON.stringify(lead));

  const backendUrl = process.env.BACKEND_INTERNAL_URL?.trim();
  if (backendUrl) {
    try {
      await fetch(`${backendUrl.replace(/\/$/, '')}/api/v1/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead),
      });
    } catch {
      // Non-blocking — frontend capture still succeeded.
    }
  }

  return NextResponse.json({ ok: true });
}
