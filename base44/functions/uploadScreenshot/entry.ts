import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await req.json();
    const { registration_token, screenshot_url } = body;

    if (!registration_token || !screenshot_url) {
      return Response.json({ error: 'Missing registration_token or screenshot_url' }, { status: 400 });
    }

    // Find device by registration token
    const devices = await base44.asServiceRole.entities.Device.filter({
      registration_token: registration_token
    });

    if (!devices || devices.length === 0) {
      return Response.json({ error: 'Device not found' }, { status: 404 });
    }

    const device = devices[0];

    // Update device with screenshot
    await base44.asServiceRole.entities.Device.update(device.id, {
      last_screenshot_url: screenshot_url
    });

    return Response.json({ success: true, device_id: device.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});