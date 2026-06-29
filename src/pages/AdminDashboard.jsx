import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Users, Monitor, Clock, DollarSign, Wifi, Search, RefreshCw, Plus, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import AdminMetricCard from "@/components/admin/AdminMetricCard";
import AdminUsersTable from "@/components/admin/AdminUsersTable";
import AdminDevicesTable from "@/components/admin/AdminDevicesTable";
import AdminSessionsTable from "@/components/admin/AdminSessionsTable";
import SupportCodePanel from "@/components/devices/SupportCodePanel";

const TABS = ["Users", "Devices", "Sessions"];

const PLAN_REVENUE = { free: 0, pro: 12, business: 39 };

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Users");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const [u, devicesRes, s] = await Promise.all([
      base44.entities.User.list("-created_date"),
      base44.functions.invoke("deviceApi", { endpoint: "devices" }),
      base44.entities.Session.list("-session_start", 100),
    ]);
    setUsers(u);
    setDevices(devicesRes?.data?.devices || []);
    setSessions(s);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Metrics
  const activeUsers = users.filter((u) => u.subscription_plan && u.subscription_plan !== "free").length;
  const activeDevices = devices.filter((d) => d.online_status === "online").length;
  const activeSessions = sessions.filter((s) => s.status === "active").length;
  const revenue = users.reduce((sum, u) => sum + (PLAN_REVENUE[u.subscription_plan] || 0), 0);

  const metrics = [
    { label: "Total Users", value: users.length, icon: Users, accent: "text-primary bg-primary/10" },
    { label: "Active Users", value: activeUsers, icon: Wifi, accent: "text-emerald-400 bg-emerald-500/10" },
    { label: "Registered Devices", value: devices.length, icon: Monitor, accent: "text-violet-400 bg-violet-500/10" },
    { label: "Active Sessions", value: activeSessions, icon: Clock, accent: "text-amber-400 bg-amber-500/10" },
    { label: "MRR", value: `$${revenue}`, icon: DollarSign, accent: "text-emerald-400 bg-emerald-500/10" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Platform overview and management</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Link to="/register-device">
            <Button size="sm" className="h-8 text-xs gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Register Device
            </Button>
          </Link>
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {metrics.map((m) => (
          <AdminMetricCard key={m.label} {...m} loading={loading} />
        ))}
      </div>

      {/* Support Codes */}
      <SupportCodePanel />

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

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-7 h-7 border-2 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === "Users" && <AdminUsersTable users={users} search={search} />}
            {activeTab === "Devices" && <AdminDevicesTable devices={devices} search={search} onRefresh={load} />}
            {activeTab === "Sessions" && <AdminSessionsTable sessions={sessions} search={search} />}
          </>
        )}
      </div>
    </div>
  );
}
