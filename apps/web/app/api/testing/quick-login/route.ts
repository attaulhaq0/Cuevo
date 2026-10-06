import { testingQuickLogin } from '../../../../features/auth/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) { return testingQuickLogin(request); }
export async function POST(request: Request) { return testingQuickLogin(request); }
