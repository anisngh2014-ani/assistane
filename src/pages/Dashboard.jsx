import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Monitor, Wifi, WifiOff, Clock, Plus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import DeviceCard from "@/components/dashboard/DeviceCard";
import StatsCard from "@/components/dashboard/StatsCard";
import { useHeartbeat } from "@/hooks/useHeartbeat";

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

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [devices, setDevices] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      const [me, devs, sess] = await Promise.all([
        base44.auth.me(),
        base44.entities.Device.list("-created_date"),
        base44.entities.Session.list("-session_start", 10),
      ]);
      setUser(me);
      setDevices(devs);
      setSessions(sess);
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    const unsubscribe = base44.entities.Device.subscribe((event) => {
      if (event.type === "update" && event.data) {
        setDevices((prev) =>
          prev.map((d) => (d.id === event.data.id ? { ...d, ...event.data } : d))
        );
      } else if (event.type === "create" && event.data) {
        setDevices((prev) => [...prev, event.data]);
      } else if (event.type === "delete") {
        setDevices((prev) => prev.filter((d) => d.id !== event.id));
      }
    });
    return unsubscribe;
  }, []);

  useHeartbeat(devices);

  const handleConnect = (device) => launchNativeViewer({ base44, device, toast });

  const handleDeleteDevice = async (device) => {
    if (!window.confirm(`Delete ${device.device_name}? This cannot be undone.`)) return;
    try {
      await base44.entities.Device.delete(device.id);
      setDevices((prev) => prev.filter((d) => d.id !== device.id));
      toast({ title: "Device deleted" });
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-7 h-7 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const onlineCount = devices.filter((d) => d.online_status === "online").length;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-heading font-bold text-xl sm:text-2xl lg:text-3xl tracking-tight">
          Welcome back{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Manage and connect to your remote devices</p>
      </div>

      {/* Stats — 2 cols on mobile, 4 on large */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatsCard icon={Monitor} label="Total Devices" value={devices.length} onClick={() => window.location.href = '/devices'} />
        <StatsCard icon={Wifi} label="Online" value={onlineCount} accent="bg-emerald-500/10 text-emerald-400" onClick={() => window.location.href = '/devices'} />
        <StatsCard icon={WifiOff} label="Offline" value={devices.length - onlineCount} accent="bg-muted text-muted-foreground" onClick={() => window.location.href = '/devices'} />
        <StatsCard icon={Clock} label="Sessions" value={sessions.length} accent="bg-primary/10 text-primary" onClick={() => window.location.href = '/sessions'} />
      </div>

      {/* Devices */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-semibold text-base sm:text-lg">Your Devices</h2>
          <div className="flex items-center gap-2">
            <Link to="/viewer-download">
              <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5">
                <Download className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Download Viewer</span>
                <span className="xs:hidden">Viewer</span>
              </Button>
            </Link>
            <Link to="/register-device">
              <Button size="sm" className="h-9 min-w-[44px] text-xs gap-1.5 touch-manipulation">
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Add Device</span>
              </Button>
            </Link>
          </div>
        </div>

        {devices.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-xl p-10 sm:p-14 text-center">
            <div className="w-12 h-12 rounded-full bg-secondary mx-auto mb-4 flex items-center justify-center">
              <Monitor className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="font-heading font-semibold text-sm mb-1">No devices registered</h3>
            <p className="text-muted-foreground text-xs mb-5">Register your first device to get started</p>
            <Link to="/register-device">
              <Button size="sm" className="h-9 text-xs touch-manipulation">Register Device</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {devices.map((device) => (
              <DeviceCard key={device.id} device={device} onConnect={handleConnect} onDelete={handleDeleteDevice} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
