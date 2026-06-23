import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Mark devices offline if last_seen > 180 seconds ago
    const cutoff = new Date(Date.now() - 180 * 1000).toISOString();
    const onlineDevices = await base44.asServiceRole.entities.Device.filter({ online_status: "online" });

    const stale = onlineDevices.filter((d) => !d.last_seen || d.last_seen < cutoff);

    await Promise.all(
      stale.map((d) =>
        base44.asServiceRole.entities.Device.update(d.id, { online_status: "offline" })
      )
    );

    return Response.json({ success: true, marked_offline: stale.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});