import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json();
    const { action } = body;

    if (action === 'list-all') {
      const requestedLimit = Number(body?.limit || 100);
      const safeLimit = Math.max(1, Math.min(requestedLimit, 200));
      const devices = await base44.asServiceRole.entities.Device.list('-created_date', safeLimit);
      return Response.json({ users: [], devices });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
