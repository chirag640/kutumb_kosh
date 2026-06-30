import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  if (request.nextUrl.pathname.startsWith('/api/mobile')) {
    const origin = request.headers.get('origin');
    const nextauthUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    
    // Strict CORS: Only allow our own production URL or local development environments
    const allowedOrigin = origin && (origin === nextauthUrl || origin.startsWith('http://localhost:'))
      ? origin
      : nextauthUrl;
      
    response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Max-Age', '86400');
    
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: response.headers,
      });
    }
  }
  
  return response;
}

export const config = {
  matcher: '/api/mobile/:path*',
};
