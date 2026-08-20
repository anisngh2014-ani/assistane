import React, { useState } from "react";
import moment from "moment";

const STATUS_FILTERS = ["All", "active", "completed", "disconnected"];

const STATUS_STYLES = {
  active: "bg-emerald-500/10 text-emerald-400",
  completed: "bg-primary/10 text-primary",
  disconnected: "bg-red-500/10 text-red-400",
};

export default function AdminSessionsTable({ sessions, search }) {
  const [statusFilter, setStatusFilter] = useState("All");

  const filtered = sessions.filter((s) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      s.device_name?.toLowerCase().includes(q) ||
      s.status?.toLowerCase().includes(q) ||
      s.device_id?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "All" || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const formatDuration = (mins) => {
    if (!mins) return "—";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border flex-wrap">
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
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} sessions</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Device</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Started</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Duration</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-10 text-muted-foreground text-xs">No sessions found</td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id} className="border-b border-border/50 hover:bg-secondary/40 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{s.device_name || "—"}</p>
                    <p className="text-xs text-muted-foreground font-mono">{s.device_id?.slice(0, 10)}…</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${STATUS_STYLES[s.status] || "bg-muted text-muted-foreground"}`}>
                      {s.status || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {s.session_start ? moment(s.session_start).format("MMM D, h:mm A") : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDuration(s.duration_minutes)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}