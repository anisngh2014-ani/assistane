export async function launchNativeViewer({ base44, device, accountId, toast }) {
  if (!device) return;

  if (device.online_status !== "online") {
    toast?.({ title: "Device is offline", variant: "destructive" });
    return;
  }

  let data;
  try {
    const res = await base44.functions.invoke("deviceApi", {
      endpoint: "viewer-connect-params",
      device_id: device.id,
      account_id: accountId || undefined,
    });
    data = res?.data || {};
  } catch (err) {
    toast?.({
      title: "Could not launch Viewer",
      description: err.message || "Unable to prepare the Viewer connection.",
      variant: "destructive",
    });
    return;
  }

  if (!data.success || !data.deep_link) {
    toast?.({
      title: "Could not launch Viewer",
      description: data.error || "Unable to prepare the Viewer connection.",
      variant: "destructive",
    });
    return;
  }

  let launched = false;
  let iframe = null;

  const cleanup = () => {
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    if (iframe?.parentNode) iframe.parentNode.removeChild(iframe);
  };

  const onBlur = () => {
    launched = true;
    cleanup();
    toast?.({
      title: `Opening ${data.device_name || device.device_name}`,
      description: "Assistane Viewer is launching.",
    });
  };

  const onVisibilityChange = () => {
    if (document.hidden) onBlur();
  };

  window.addEventListener("blur", onBlur, { once: true });
  document.addEventListener("visibilitychange", onVisibilityChange);

  iframe = document.createElement("iframe");
  iframe.style.display = "none";
  document.body.appendChild(iframe);
  iframe.src = data.deep_link;

  window.setTimeout(() => {
    cleanup();
    if (launched) return;
    const shouldDownload = window.confirm(
      "Assistane Viewer did not open. Install the Viewer app now?"
    );
    if (shouldDownload) window.location.assign("/download-viewer");
  }, 1800);
}
