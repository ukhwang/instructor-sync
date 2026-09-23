export const runtime = 'nodejs';

const disabled = () =>
  Response.json({ code: 'AUTH_DISABLED' }, { status: 404 });

export const GET = disabled;
export const POST = disabled;
