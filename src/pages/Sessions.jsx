import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Clock, Monitor } from "lucide-react";
import moment from "moment";

const STATUS_STYLES = {
  active: "bg-emerald-500/10 text-emerald-400",
  completed: "bg-primary/10 text-primary",
  disconnected: "bg-destructive/10 text-destructive",
};

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Session.list("-session_start").then((data) => {
      setSessions(data);
      setLoading(false);
    });
  }, []);

  const formatDuration = (mins) => {
    if (!mins) return "—";
    if (mins < 60) return `${Math.round(mins)}m`;
    return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-7 h-7 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading font-bold text-xl sm:text-2xl tracking-tight">Session History</h1>
        <p className="text-muted-foreground text-sm mt-1">View your remote connection logs</p>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-10 sm:p-14 text-center">
          <div className="w-12 h-12 rounded-full bg-secondary mx-auto mb-4 flex items-center justify-center">
            <Clock className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="font-heading font-semibold text-sm mb-1">No sessions yet</h3>
          <p className="text-muted-foreground text-xs">Connect to a device to create your first session</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Device", "Start", "End", "Duration", "Status"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <Monitor className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate max-w-[140px]">{s.device_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                      {moment(s.session_start).format("MMM D, YYYY h:mm A")}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                      {s.session_end ? moment(s.session_end).format("MMM D, YYYY h:mm A") : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-mono text-muted-foreground">
                      {formatDuration(s.duration_minutes)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[s.status] || "bg-muted text-muted-foreground"}`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {sessions.map((s) => (
              <div key={s.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Monitor className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-semibold truncate">{s.device_name}</span>
                  </div>
                  <span className={`shrink-0 ml-2 px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[s.status] || "bg-muted text-muted-foreground"}`}>
                    {s.status}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground/60 mb-0.5">Start</p>
                    <p>{moment(s.session_start).format("MMM D, h:mm A")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground/60 mb-0.5">End</p>
                    <p>{s.session_end ? moment(s.session_end).format("h:mm A") : "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground/60 mb-0.5">Duration</p>
                    <p className="font-mono">{formatDuration(s.duration_minutes)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}