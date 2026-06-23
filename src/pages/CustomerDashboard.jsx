import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import AdminMetricCard from "@/components/admin/AdminMetricCard";
import CustomerAppLayout from "@/components/layout/CustomerAppLayout";
import { Monitor, Clock, User, RefreshCw, Search, Plus, Play, Wifi, Trash2, Download } from "lucide-react";
import { base44 } from "@/api/base44Client";
import DeviceCard from "@/components/dashboard/DeviceCard";
import moment from "moment";

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

export default function CustomerDashboard() {
  const [accountName, setAccountName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accountToken, setAccountToken] = useState("");
  const [devices, setDevices] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Get active tab from URL params
  const getActiveTab = () => {
    const params = new URLSearchParams(location.search);
    return params.get("tab") || "Dashboard";
  };

  const activeTab = getActiveTab();

  const forceLogout = () => {
    localStorage.removeItem("accountToken");
    localStorage.removeItem("accountId");
    localStorage.removeItem("accountName");
    navigate("/account-login?error=suspended");
  };

  const checkAccountStatus = async (id) => {
    try {
      const res = await base44.functions.invoke("deviceApi", {
        endpoint: "check-account-status",
        account_id: id,
      });
      if (res.data.suspended) {
        forceLogout();
      }
    } catch (_) {}
  };

  useEffect(() => {
    const name = localStorage.getItem("accountName");
    const id = localStorage.getItem("accountId");
    const token = localStorage.getItem("accountToken");

    if (!token) {
      navigate("/account-login");
      return;
    }

    setAccountName(name || "Customer");
    setAccountId(id || "");
    setAccountToken(token);
    loadData(token, id);

    // Poll every 10 seconds to detect if account has been suspended
    const interval = setInterval(() => {
      const currentId = localStorage.getItem("accountId");
      if (currentId) checkAccountStatus(currentId);
    }, 10000);

    return () => clearInterval(interval);
  }, [navigate]);

  const loadData = async (token, id) => {
    setLoading(true);
    try {
      const devicesRes = await base44.functions.invoke("deviceApi", {
        endpoint: "devices",
        account_id: id,
      });
      if (devicesRes.data.error === "Account suspended") {
        forceLogout();
        return;
      }
      if (devicesRes.data.success) {
        setDevices(devicesRes.data.devices || []);
      }

      const sessionsRes = await base44.functions.invoke("deviceApi", {
        endpoint: "sessions",
        account_id: id,
      });
      if (sessionsRes.data.success) {
        setSessions(sessionsRes.data.sessions || []);
      }
      
      setProfile({
        account_id: accountId,
        account_name: localStorage.getItem("accountName"),
        email: localStorage.getItem("accountEmail") || "",
      });
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadData(accountToken, accountId);
    toast({ title: "Refreshed" });
  };



  const handleConnectDevice = (device) => {
    launchNativeViewer({ base44, device, accountId, toast });
  };

  const handleDeleteDevice = async (device) => {
    if (!window.confirm(`Delete ${device.device_name}? This cannot be undone.`)) return;
    try {
      await base44.functions.invoke("deviceApi", {
        endpoint: "device",
        id: device.id,
        _method: "DELETE",
      });
      setDevices((prev) => prev.filter((d) => d.id !== device.id));
      toast({ title: "Device deleted" });
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const filteredDevices = devices.filter((d) =>
    d.device_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.device_uid?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredSessions = sessions.filter((s) =>
    s.device_name?.toLowerCase().includes(search.toLowerCase())
  );

  const activeDevices = devices.filter((d) => d.online_status === "online").length;
  const offlineDevices = devices.filter((d) => d.online_status === "offline").length;

  const navigateToTab = (tab) => navigate(`/customer-dashboard?tab=${tab}`);

  const metrics = [
    { label: "Total Devices", value: devices.length, icon: Monitor, accent: "text-primary bg-primary/10", onClick: () => navigateToTab("Devices") },
    { label: "Online", value: activeDevices, icon: Wifi, accent: "text-emerald-400 bg-emerald-500/10", onClick: () => navigateToTab("Devices") },
    { label: "Offline", value: offlineDevices, icon: Monitor, accent: "text-amber-400 bg-amber-500/10", onClick: () => navigateToTab("Devices") },
    { label: "Sessions", value: sessions.length, icon: Clock, accent: "text-violet-400 bg-violet-500/10", onClick: () => navigateToTab("Sessions") },
  ];

  if (loading) {
    return (
      <CustomerAppLayout>
        <div className="flex items-center justify-center h-96">
          <div className="w-7 h-7 border-2 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      </CustomerAppLayout>
    );
  }

  return (
    <CustomerAppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-heading font-bold text-2xl sm:text-3xl tracking-tight">
              {activeTab === "Dashboard" ? "Dashboard" :
               activeTab === "Devices" ? "Devices" :
               activeTab === "Sessions" ? "Session History" :
               "Profile"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Account: {accountId}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/viewer-download">
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                <Download className="w-3.5 h-3.5" />
                Download Viewer
              </Button>
            </Link>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground text-xs font-medium transition-all h-fit"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>

        {/* Dashboard Tab */}
        {activeTab === "Dashboard" && (
          <div className="space-y-6">
            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {metrics.map((m) => (
                <AdminMetricCard key={m.label} {...m} loading={false} />
              ))}
            </div>

            {/* Welcome Card */}
            <div className="bg-card border border-border rounded-xl p-6 space-y-2">
              <h2 className="font-semibold text-lg">Welcome, {accountName}!</h2>
              <p className="text-muted-foreground text-sm">Account ID: {accountId}</p>
              <p className="text-muted-foreground text-sm">
                Manage your devices and sessions from the navigation menu above.
              </p>
            </div>
          </div>
        )}

        {/* Devices Tab */}
        {activeTab === "Devices" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search devices..."
                  className="pl-8 h-9 text-xs bg-secondary border-border"
                />
              </div>
              <Button size="sm" className="h-9 text-xs gap-1.5" onClick={() => navigate("/customer-register-device")}>
                <Plus className="w-3.5 h-3.5" />
                Add Device
              </Button>
            </div>

            {filteredDevices.length === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-xl p-10 sm:p-14 text-center">
                <div className="w-12 h-12 rounded-full bg-secondary mx-auto mb-4 flex items-center justify-center">
                  <Monitor className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-heading font-semibold text-sm mb-1">{devices.length === 0 ? "No devices registered" : "No devices match your search"}</h3>
                <p className="text-muted-foreground text-xs mb-5">Register your first device to get started</p>
                <Button size="sm" className="h-9 text-xs gap-1.5" onClick={() => navigate("/customer-register-device")}>
                  <Plus className="w-3.5 h-3.5" />
                  Register Device
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {filteredDevices.map((device) => (
                  <DeviceCard key={device.id} device={device} onConnect={handleConnectDevice} onDelete={handleDeleteDevice} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sessions Tab */}
        {activeTab === "Sessions" && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sessions..."
                className="pl-8 h-9 text-xs bg-secondary border-border"
              />
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 border-b border-border">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold">Device Name</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold">Start Time</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSessions.length === 0 ? (
                      <tr>
                        <td colSpan="3" className="px-4 py-12 text-center text-muted-foreground text-sm">
                          No active sessions
                        </td>
                      </tr>
                    ) : (
                      filteredSessions.map((session) => (
                        <tr key={session.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                          <td className="px-4 py-3 text-xs font-medium">{session.device_name}</td>
                          <td className="px-4 py-3 text-xs">
                            {new Date(session.session_start).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span className="inline-block px-2 py-1 rounded bg-primary/20 text-primary text-[10px] font-semibold">
                              {session.status || "active"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Profile Tab */}
        {activeTab === "Profile" && profile && (
          <div className="max-w-2xl">
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="font-semibold text-base mb-6">Account Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-2">Account ID</p>
                  <p className="text-sm font-semibold">{profile.account_id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-2">Name</p>
                  <p className="text-sm font-semibold">{profile.account_name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-2">Email</p>
                  <p className="text-sm font-semibold">{profile.email || "—"}</p>
                </div>
              </div>
            </div>
          </div>
        )}


      </div>
    </CustomerAppLayout>
  );
}
