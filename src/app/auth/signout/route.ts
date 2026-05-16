import { NextResponse, type NextRequest } from 'next/server';
import { serverClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const supabase = await serverClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', req.nextUrl), { status: 303 });
}

export async function GET(req: NextRequest) {
  // Allow a plain link to sign out too.
  return POST(req);
}
