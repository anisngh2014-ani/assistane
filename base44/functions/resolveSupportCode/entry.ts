import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let code = null;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      code = body?.code;
    } else if (req.method === "GET") {
      const url = new URL(req.url);
      code = url.searchParams.get("code");
    }

    if (!code) return Response.json({ error: "Missing code" }, { status: 400 });

    const matches = await base44.asServiceRole.entities.SupportCode.filter({ short_code: code.trim() });
    const record = matches[0];

    if (!record) return Response.json({ error: "Invalid code" }, { status: 404 });
    if (record.used) return Response.json({ error: "Code already used" }, { status: 410 });
    if (new Date(record.expires_at) < new Date()) {
      return Response.json({ error: "Code expired. Ask your technician for a new one." }, { status: 410 });
    }

    // NOTE: We do NOT mark as used here — the code stays valid until the agent
    // successfully registers the device. This lets the user re-download if needed.
    // The register-device endpoint marks it used after successful registration.

    return Response.json({
      success: true,
      short_code: record.short_code,
      expires_at: record.expires_at,
      label: record.label || "",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
