import React, { useState } from "react";
import { X, Monitor, Calendar, DollarSign, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

async function launchNativeViewer({ base44, device, accountId, toast }) {
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
    const shouldDownload = window.confirm("Assistane Viewer did not open. Install the Viewer app now?");
    if (shouldDownload) window.location.assign("/download-viewer");
  }, 1800);
}

export default function UserDetailModal({ user, devices = [], onClose }) {
  const [connecting, setConnecting] = React.useState(null);
  
  const userDevices = devices.filter((d) => d.user_id === user.id);
  const registeredDate = user.created_date ? new Date(user.created_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—";
  const subscriptionEndDate = user.subscription_expires ? new Date(user.subscription_expires).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—";

  const handleConnect = async (device) => {
    setConnecting(device.id);
    try {
      await launchNativeViewer({ base44, device });
      onClose();
    } catch (err) {
      console.error("Connection error:", err);
    } finally {
      setConnecting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-xl">{user.full_name || user.username}</h2>
            <p className="text-muted-foreground text-sm">{user.email}</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Account Info */}
        <div className="space-y-3 pb-4 border-b border-border">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1">Account ID</p>
              <p className="text-sm font-semibold text-primary">{user.account_id || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1">Plan</p>
              <p className="text-sm font-semibold capitalize">{user.subscription_plan || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Registered
              </p>
              <p className="text-sm font-semibold">{registeredDate}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" />
                Subscription Ends
              </p>
              <p className="text-sm font-semibold">{subscriptionEndDate}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1">Status</p>
            <span className={`inline-block px-2 py-1 rounded text-[11px] font-semibold ${
              user.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
            }`}>
              {user.status}
            </span>
          </div>
        </div>

        {/* Devices */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Monitor className="w-4 h-4" />
            Registered Devices ({userDevices.length})
          </h3>
          {userDevices.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No devices registered</p>
          ) : (
            <div className="space-y-2">
              {userDevices.map((device) => (
                <div key={device.id} className="bg-secondary/50 border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{device.device_name}</p>
                      <p className="text-xs text-muted-foreground">{device.operating_system}</p>
                    </div>
                    <span className={`inline-block px-2 py-1 rounded text-[10px] font-semibold whitespace-nowrap ${
                      device.online_status === "online"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {device.online_status}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid grid-cols-3 gap-2 text-xs flex-1">
                      <div>
                        <p className="text-muted-foreground">Device ID</p>
                        <p className="font-mono text-[11px] break-all">{device.device_uid}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Last Seen</p>
                        <p className="font-semibold">
                          {device.last_seen ? new Date(device.last_seen).toLocaleDateString() : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Resolution</p>
                        <p className="font-semibold">
                          {device.screen_width && device.screen_height
                            ? `${device.screen_width}x${device.screen_height}`
                            : "—"}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1 whitespace-nowrap"
                      onClick={() => handleConnect(device)}
                      disabled={connecting === device.id || device.online_status !== "online"}
                    >
                      {connecting === device.id ? (
                        <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Close Button */}
        <div className="flex gap-2 pt-4 border-t border-border">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
