import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Generate unique UUID-based support code (never repeats)
function generateUniqueCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { label, expiry_hours = 24 } = body;

    // Generate unique 6-digit short code
    let short_code = generateUniqueCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await base44.asServiceRole.entities.SupportCode.filter({ short_code });
      if (existing.length === 0) break; // Found unique code
      short_code = generateUniqueCode();
      attempts++;
    }

    if (attempts === 10) {
      return Response.json({ error: "Failed to generate unique code" }, { status: 500 });
    }

    // Generate full UUID for internal tracking
    const code = crypto.randomUUID().replace(/-/g, "");

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiry_hours);

    const existingActive = await base44.asServiceRole.entities.SupportCode.filter({ user_id: user.id });
    const now = new Date();
    await Promise.all(
      existingActive
        .filter((c) => !c.used && new Date(c.expires_at) > now)
        .map((c) => base44.asServiceRole.entities.SupportCode.update(c.id, { used: true }))
    );

    // Use user-scoped client so created_by_id matches the logged-in user
    const supportCode = await base44.entities.SupportCode.create({
      user_id: user.id,
      code,
      short_code,
      pairing_token: crypto.randomUUID().replace(/-/g, ""),
      expires_at: expiresAt.toISOString(),
      label: label || "",
    });

    return Response.json({ success: true, short_code, expires_at: expiresAt.toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
