import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Users, Monitor, Clock, Wifi, Search, RefreshCw, Plus, Trash2, Lock, Download, RotateCcw } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import AdminMetricCard from "@/components/admin/AdminMetricCard";
import UserDetailModal from "@/components/admin/UserDetailModal";
import DeviceCard from "@/components/dashboard/DeviceCard";
import { useToast } from "@/components/ui/use-toast";

const TABS = ["Users", "Devices", "Sessions"];

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

export default function OwnerDashboard() {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Users");
  const [search, setSearch] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserPass, setNewUserPass] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const navigate = useNavigate();
  const [selectedUser, setSelectedUser] = useState(null);
  const { toast } = useToast();

  const invokeWithRetry = async (functionName, payload, attempts = 2) => {
    let lastError;
    for (let i = 0; i < attempts; i++) {
      try {
        return await base44.functions.invoke(functionName, payload);
      } catch (err) {
        lastError = err;
        const msg = String(err?.message || "");
        if (!msg.includes("429") || i === attempts - 1) break;
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
    throw lastError;
  };

  const load = async () => {
    setLoading(true);
    try {
      const me = await base44.auth.me();
      setUser(me);
      // Only the original platform owner can access (no created_by_id means they're the owner)
      if (me?.role !== "admin" || me?.created_by_id) {
        toast({ title: "Access denied", variant: "destructive" });
        setLoading(false);
        return;
      }
      // Get all accounts (admin can see all)
      try {
        const accountsRes = await invokeWithRetry("deviceApi", {
          endpoint: "accounts",
          limit: 100,
        });
        if (accountsRes.data.error) {
          toast({ title: "Error", description: accountsRes.data.error, variant: "destructive" });
          setUsers([]);
        } else {
          setUsers(accountsRes.data.accounts || []);
        }
      } catch (e) {
        toast({ title: "Error loading accounts", description: e.message, variant: "destructive" });
        setUsers([]);
      }
      
      try {
        const devicesRes = await invokeWithRetry("ownerAdmin", { action: "list-all", limit: 100 });
        setDevices(devicesRes.data.devices || []);
      } catch (e) {
        console.error("Devices error:", e);
        setDevices([]);
      }

      setSessions([]);
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const loadSessions = async () => {
    try {
      const res = await invokeWithRetry("deviceApi", {
        endpoint: "sessions",
        all: true,
        limit: 100,
      });
      setSessions(res.data.sessions || []);
    } catch (e) {
      console.error("Sessions error:", e);
      setSessions([]);
      toast({ title: "Error loading sessions", description: e.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (activeTab === "Sessions" && sessions.length === 0) {
      loadSessions();
    }
  }, [activeTab]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserName || !newUserPass) {
      toast({ title: "Fill in all fields" });
      return;
    }
    setCreating(true);
    try {
      const res = await base44.functions.invoke("deviceApi", {
        endpoint: "create-user",
        username: newUserName,
        password: newUserPass,
        email: `${newUserName}@remote-pilot.local`,
      });
      if (res.data.success) {
        toast({ title: "Account created", description: `${newUserName} can now login` });
        setNewUserName("");
        setNewUserPass("");
        setShowCreateUser(false);
        load();
      }
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteUser = async (accountId, email) => {
    if (!window.confirm(`Revoke access for ${email}? Their account will be suspended immediately and they will be logged out.`)) return;
    try {
      const res = await base44.functions.invoke("deviceApi", {
        endpoint: "account",
        id: accountId,
        _method: "DELETE",
      });
      if (res.data.success) {
        toast({ title: "Account suspended", description: "User access revoked immediately. They cannot log in until reactivated." });
        load();
      } else {
        toast({ title: "Error", description: res.data.error || "Failed to suspend account", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: err.message || "Failed to suspend account", variant: "destructive" });
    }
  };

  const handleReactivateUser = async (accountId, email) => {
    if (!window.confirm(`Reactivate account ${email}? They will be able to log in again.`)) return;
    try {
      const res = await base44.functions.invoke("deviceApi", {
        endpoint: "reactivate-account",
        id: accountId,
      });
      if (res.data.success) {
        toast({ title: "Account reactivated", description: `${email} can log in again.` });
        load();
      } else {
        toast({ title: "Error", description: res.data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handlePermanentDelete = async (accountId, username) => {
    if (!window.confirm(`PERMANENTLY DELETE account "${username}"?\n\nThis will delete the account, all devices, and all data. This CANNOT be undone.`)) return;
    try {
      const res = await base44.functions.invoke("deviceApi", {
        endpoint: "permanent-delete-account",
        id: accountId,
      });
      if (res.data.success) {
        toast({ title: "Account permanently deleted", description: `${username} and all their data have been removed.` });
        load();
      } else {
        toast({ title: "Error", description: res.data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleChangePassword = async (userId) => {
    if (!newPassword) {
      toast({ title: "Enter a new password" });
      return;
    }
    try {
      const res = await base44.functions.invoke("deviceApi", {
        endpoint: "account",
        _method: "PUT",
        id: userId,
        password: newPassword,
      });
      if (res.data.success) {
        toast({ title: "Password updated" });
        setEditingId(null);
        setNewPassword("");
      }
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleChangePlan = async (account, plan) => {
    try {
      const res = await base44.functions.invoke("deviceApi", {
        endpoint: "account",
        _method: "PUT",
        id: account.id,
        subscription_plan: plan,
      });
      if (res.data.success) {
        toast({ title: "Plan updated", description: `${account.username} is now on ${plan}.` });
        load();
      } else {
        toast({ title: "Error", description: res.data.error || "Could not update plan", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const filteredUsers = users.filter((u) =>
    u.username?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.account_id?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredDevices = devices.filter((d) =>
    d.device_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.device_uid?.toLowerCase().includes(search.toLowerCase()) ||
    d.operating_system?.toLowerCase().includes(search.toLowerCase()) ||
    d.ip_address?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredSessions = sessions.filter((s) =>
    s.device_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.status?.toLowerCase().includes(search.toLowerCase())
  );

  const activeUsers = users.filter((u) => u.status === "active").length;
  const activeDevices = devices.filter((d) => d.online_status === "online").length;

  const metrics = [
    { label: "Total Users", value: users.length, icon: Users, accent: "text-primary bg-primary/10" },
    { label: "Active Users", value: activeUsers, icon: Wifi, accent: "text-emerald-400 bg-emerald-500/10" },
    { label: "Total Devices", value: devices.length, icon: Monitor, accent: "text-violet-400 bg-violet-500/10" },
    { label: "Online Devices", value: activeDevices, icon: Clock, accent: "text-amber-400 bg-amber-500/10" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-7 h-7 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || user.role !== "admin" || user?.created_by_id) {
    return (
      <div className="text-center py-20">
        <Lock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h1 className="font-semibold text-lg mb-2">Platform Owner Only</h1>
        <p className="text-muted-foreground">This dashboard is reserved for the platform owner.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl tracking-tight">Owner Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage all users and devices</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowCreateUser(true)}>
            <Plus className="w-3.5 h-3.5" />
            Create User
          </Button>
          <Link to="/viewer-download">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
              <Download className="w-3.5 h-3.5" />
              Download Viewer
            </Button>
          </Link>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground text-xs font-medium transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <AdminMetricCard 
            key={m.label} 
            {...m} 
            loading={false}
            onClick={() => setActiveTab(m.label === "Total Users" || m.label === "Active Users" ? "Users" : "Devices")}
          />
        ))}
      </div>

      {/* Create User Modal */}
      {showCreateUser && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl max-w-sm w-full p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-lg">Create New User</h2>
              <p className="text-muted-foreground text-sm">Generate login credentials for a new user</p>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="text-xs font-medium">Username</label>
                <Input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Choose a username"
                  disabled={creating}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Password</label>
                <Input
                  type="password"
                  value={newUserPass}
                  onChange={(e) => setNewUserPass(e.target.value)}
                  placeholder="Strong password"
                  disabled={creating}
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-9"
                  onClick={() => setShowCreateUser(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 h-9" disabled={creating || !newUserName || !newUserPass}>
                  {creating ? (
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    "Create"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Detail Modal */}
      {selectedUser && (
        <UserDetailModal user={selectedUser} devices={devices} onClose={() => setSelectedUser(null)} />
      )}

      {/* Tables */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Tab Bar + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-border">
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setSearch(""); }}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeTab === tab
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${activeTab.toLowerCase()}...`}
              className="pl-8 h-8 text-xs bg-secondary border-border"
            />
          </div>
        </div>

        {/* Accounts Table */}
        {activeTab === "Users" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold">Account ID</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold">Username</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold">Email</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold">Plan</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold">Devices</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                   const userDevices = devices.filter((d) => d.user_id === u.id).length;
                   return (
                     <tr 
                       key={u.id} 
                       className="border-b border-border hover:bg-secondary/30 cursor-pointer transition-colors"
                       onClick={() => setSelectedUser(u)}
                     >
                       <td className="px-4 py-2 text-xs font-semibold text-primary">{u.account_id || "—"}</td>
                       <td className="px-4 py-2 text-xs font-medium">{u.username}</td>
                       <td className="px-4 py-2 text-xs">{u.email}</td>
                       <td className="px-4 py-2 text-xs">{u.full_name || "—"}</td>
                       <td className="px-4 py-2 text-xs">
                         <span className="inline-block px-2 py-1 rounded bg-primary/20 text-primary text-[10px] font-semibold">
                           <select
                             value={u.subscription_plan || "basic"}
                             onClick={(e) => e.stopPropagation()}
                             onChange={(e) => handleChangePlan(u, e.target.value)}
                             className="bg-primary/10 border border-primary/20 rounded px-2 py-1 text-[10px] font-semibold text-primary"
                           >
                             <option value="basic">basic</option>
                             <option value="pro">pro</option>
                             <option value="enterprise">enterprise</option>
                           </select>
                         </span>
                       </td>
                       <td className="px-4 py-2 text-xs">
                         <span className={`inline-block px-2 py-1 rounded text-[10px] font-semibold ${
                           u.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                         }`}>
                           {u.status}
                         </span>
                       </td>
                       <td className="px-4 py-2 text-xs">{userDevices}</td>
                      <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {u.status !== "suspended" ? (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingId(editingId === u.id ? null : u.id); }}
                              className="text-amber-400 hover:text-amber-500 transition"
                              title="Change Password"
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteUser(u.id, u.email); }}
                              className="text-red-400 hover:text-red-500 transition"
                              title="Revoke Access"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleReactivateUser(u.id, u.email); }}
                              className="text-emerald-400 hover:text-emerald-500 transition"
                              title="Restore Access"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handlePermanentDelete(u.id, u.username); }}
                              className="text-red-500 hover:text-red-600 transition"
                              title="Permanently Delete Account"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                        {editingId === u.id && (
                          <div className="mt-2 flex gap-2">
                            <Input
                              type="password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="New password"
                              className="h-7 text-xs"
                            />
                            <Button
                              size="sm"
                              className="h-7 text-xs px-2"
                              onClick={() => handleChangePassword(u.id)}
                            >
                              Save
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">No accounts found</div>
            )}
          </div>
        )}

        {/* Devices Grid */}
        {activeTab === "Devices" && (
          <>
            {filteredDevices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No devices found</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {filteredDevices.map((device) => (
                  <DeviceCard 
                    key={device.id} 
                    device={device} 
                    onConnect={() => launchNativeViewer({ base44, device, toast })}
                    onDelete={() => {
                      if (!window.confirm(`Delete ${device.device_name}?`)) return;
                      base44.functions.invoke("deviceApi", {
                        endpoint: "device",
                        id: device.id,
                        _method: "DELETE",
                      }).then(() => load()).catch((err) => toast({ title: "Error", description: err.message, variant: "destructive" }));
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "Sessions" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold">Device</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold">Started</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold">Ended</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold">Duration</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((s) => (
                  <tr key={s.id} className="border-b border-border hover:bg-secondary/30">
                    <td className="px-4 py-2 text-xs font-medium">{s.device_name || s.device_id}</td>
                    <td className="px-4 py-2 text-xs">{s.session_start ? new Date(s.session_start).toLocaleString() : "-"}</td>
                    <td className="px-4 py-2 text-xs">{s.session_end ? new Date(s.session_end).toLocaleString() : "-"}</td>
                    <td className="px-4 py-2 text-xs">{s.duration_minutes ?? 0} min</td>
                    <td className="px-4 py-2 text-xs">{s.status || "active"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredSessions.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">No sessions found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
