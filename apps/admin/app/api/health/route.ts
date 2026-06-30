import { NextResponse } from 'next/server';

/**
 * GET /api/health
 *
 * Simple health check endpoint for monitoring and uptime tracking.
 * Returns server status, timestamp, and environment info.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
  });
}
