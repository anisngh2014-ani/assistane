import React, { useState } from "react";
import moment from "moment";
import { base44 } from "@/api/base44Client";
import { EyeOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const STATUS_FILTERS = ["All", "online", "offline"];

export default function AdminDevicesTable({ devices, search, onRefresh }) {
  const [statusFilter, setStatusFilter] = useState("All");
  const [showDialog, setShowDialog] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [message, setMessage] = useState("This device has been locked by the administrator.");
  const [loading, setLoading] = useState(false);

  const filtered = devices.filter((d) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      d.device_name?.toLowerCase().includes(q) ||
      d.operating_system?.toLowerCase().includes(q) ||
      d.device_uid?.toLowerCase().includes(q) ||
      d.ip_address?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "All" || d.online_status === statusFilter;
    return matchSearch && matchStatus;
  });

  const openBlackScreen = (device) => {
    setSelectedDevice(device);
    setMessage(device.black_screen_message || "This device has been locked by the administrator.");
    setShowDialog(true);
  };

  const applyBlackScreen = async (enabled) => {
    if (!selectedDevice) return;
    setLoading(true);
    await base44.entities.Device.update(selectedDevice.id, {
      black_screen: enabled,
      black_screen_message: enabled ? message : "",
    });
    setLoading(false);
    setShowDialog(false);
    onRefresh?.();
  };

  return (
    <div>
      {/* Status filter */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border">
        <span className="text-xs text-muted-foreground mr-1">Status:</span>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all capitalize ${
              statusFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} devices</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Device</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">OS</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">IP Address</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Seen</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-muted-foreground text-xs">No devices found</td>
              </tr>
            ) : (
              filtered.map((d) => (
                <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/40 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{d.device_name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{d.device_uid?.slice(0, 12)}…</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{d.operating_system}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-semibold ${
                      d.online_status === "online"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-red-500/10 text-red-400"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${d.online_status === "online" ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
                      {d.online_status === "online" ? "Online" : "Offline"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{d.ip_address || "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {d.last_seen ? moment(d.last_seen).fromNow() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant={d.black_screen ? "destructive" : "outline"}
                      className="h-7 text-xs gap-1.5"
                      onClick={() => openBlackScreen(d)}
                    >
                      {d.black_screen ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      {d.black_screen ? "Unlock Screen" : "Black Screen"}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Black Screen Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-primary" />
              {selectedDevice?.black_screen ? "Unlock Screen" : "Black Screen"}
            </DialogTitle>
          </DialogHeader>

          {selectedDevice?.black_screen ? (
            <p className="text-sm text-muted-foreground">
              Remove the black screen lockout from <strong>{selectedDevice?.device_name}</strong>? The device screen will become visible again.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                The screen on <strong>{selectedDevice?.device_name}</strong> will go black and show this message:
              </p>
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Message shown on the locked screen..."
                className="text-sm"
              />
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>Cancel</Button>
            {selectedDevice?.black_screen ? (
              <Button size="sm" onClick={() => applyBlackScreen(false)} disabled={loading}>
                {loading ? "Unlocking…" : "Unlock Screen"}
              </Button>
            ) : (
              <Button size="sm" variant="destructive" onClick={() => applyBlackScreen(true)} disabled={loading}>
                {loading ? "Applying…" : "Apply Black Screen"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}