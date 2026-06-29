import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, Monitor, RefreshCw, CheckSquare, Square, RotateCcw, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import DeviceManagementCard from "@/components/devices/DeviceManagementCard";

const STATUS_FILTERS = [
  { label: "All", value: "all" },
  { label: "Online", value: "online" },
  { label: "Offline", value: "offline" },
];

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

export default function Devices() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const { toast } = useToast();

  const loadDevices = async () => {
    setLoading(true);
    const [me, res] = await Promise.all([
      base44.auth.me(),
      base44.functions.invoke("deviceApi", { endpoint: "devices" }),
    ]);
    setUser(me);
    setDevices(res?.data?.devices || []);
    setLoading(false);
  };

  useEffect(() => {
    loadDevices();
  }, []);

  // Real-time updates
  useEffect(() => {
    const unsubscribe = base44.entities.Device.subscribe((event) => {
      if (event.type === "update" && event.data) {
        setDevices((prev) =>
          prev.map((d) => (d.id === event.data.id ? { ...d, ...event.data } : d))
        );
      } else if (event.type === "create" && event.data?.user_id === user?.id) {
        setDevices((prev) => [...prev, event.data]);
      } else if (event.type === "delete") {
        setDevices((prev) => prev.filter((d) => d.id !== event.id));
      }
    });
    return unsubscribe;
  }, [user?.id]);

  const handleConnect = (device) => launchNativeViewer({ base44, device, toast });

  const handleDelete = async (device) => {
    await base44.entities.Device.delete(device.id);
    setDevices((prev) => prev.filter((d) => d.id !== device.id));
    toast({ title: "Device removed", description: `${device.device_name} has been deleted.` });
  };

  const filtered = devices
    .filter((d) => {
      const matchesSearch =
        d.device_name?.toLowerCase().includes(search.toLowerCase()) ||
        d.operating_system?.toLowerCase().includes(search.toLowerCase()) ||
        d.device_uid?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === "all" || d.online_status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (a.online_status === "online" && b.online_status !== "online") return -1;
      if (a.online_status !== "online" && b.online_status === "online") return 1;
      return 0;
    });

  const onlineCount = devices.filter((d) => d.online_status === "online").length;

  const toggleSelect = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((d) => d.id));
    }
  };

  const sendBulkCommand = async (command) => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    await Promise.all(
      selectedIds.map((id) =>
        base44.entities.Device.update(id, { pending_command: command })
      )
    );
    setBulkLoading(false);
    setSelectedIds([]);
    toast({
      title: `Command sent`,
      description: `"${command}" sent to ${selectedIds.length} device(s).`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl tracking-tight">Devices</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {devices.length} registered &bull;{" "}
            <span className="text-emerald-400 font-medium">{onlineCount} online</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
           <Button variant="secondary" size="sm" className="h-9 text-xs gap-1.5" onClick={loadDevices}>
             <RefreshCw className="w-3.5 h-3.5" />
             Refresh
           </Button>
           <Link to="/register-device">
             <Button size="sm" className="h-10 text-xs gap-1.5 touch-manipulation">
               <Plus className="w-3.5 h-3.5" />
               Add Device
             </Button>
           </Link>
         </div>
      </div>

      {/* Search + Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, OS, or device ID..."
            className="pl-9 h-10 bg-card border-border"
          />
        </div>
        <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                statusFilter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-xl px-4 py-3">
          <span className="text-sm font-medium text-primary">{selectedIds.length} selected</span>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={() => sendBulkCommand("lock")}
              disabled={bulkLoading}
            >
              <EyeOff className="w-3.5 h-3.5" />
              Lock Screen
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 text-xs gap-1.5"
              onClick={() => sendBulkCommand("reboot")}
              disabled={bulkLoading}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reboot
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => setSelectedIds([])}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Select All toggle (only shown when devices exist) */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {selectedIds.length === filtered.length && filtered.length > 0
              ? <CheckSquare className="w-4 h-4 text-primary" />
              : <Square className="w-4 h-4" />}
            {selectedIds.length === filtered.length && filtered.length > 0 ? "Deselect All" : "Select All"}
          </button>
        </div>
      )}

      {/* Device Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-56">
          <div className="w-7 h-7 border-2 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-14 text-center">
          <div className="w-12 h-12 rounded-full bg-secondary mx-auto mb-4 flex items-center justify-center">
            <Monitor className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="font-heading font-semibold text-sm mb-1">
            {search || statusFilter !== "all" ? "No devices match your filters" : "No devices registered"}
          </h3>
          <p className="text-muted-foreground text-xs mb-4">
            {search || statusFilter !== "all" ? "Try adjusting your search or filter" : "Register your first device to get started"}
          </p>
          {!search && statusFilter === "all" && (
            <Link to="/register-device">
              <Button size="sm" className="h-8 text-xs">Register Device</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((device) => {
            const isSelected = selectedIds.includes(device.id);
            return (
              <div
                key={device.id}
                className={`relative rounded-xl transition-all ${isSelected ? "ring-2 ring-primary" : ""}`}
              >
                <button
                  onClick={() => toggleSelect(device.id)}
                  className="absolute top-3 right-3 z-10"
                >
                  {isSelected
                    ? <CheckSquare className="w-4 h-4 text-primary" />
                    : <Square className="w-4 h-4 text-muted-foreground hover:text-foreground" />}
                </button>
                <DeviceManagementCard
                  device={device}
                  onConnect={handleConnect}
                  onDelete={handleDelete}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
