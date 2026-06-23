import React, { useState } from "react";
import moment from "moment";
import { Crown, Zap, Building2 } from "lucide-react";

const PLAN_CONFIG = {
  free: { label: "Free", cls: "bg-muted text-muted-foreground" },
  pro: { label: "Pro", cls: "bg-primary/10 text-primary" },
  business: { label: "Business", cls: "bg-amber-400/10 text-amber-400" },
};

const ROLE_FILTERS = ["All", "admin", "user"];

export default function AdminUsersTable({ users, search }) {
  const [roleFilter, setRoleFilter] = useState("All");

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.subscription_plan?.toLowerCase().includes(q);
    const matchRole = roleFilter === "All" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  return (
    <div>
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border">
        <span className="text-xs text-muted-foreground mr-1">Role:</span>
        {ROLE_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setRoleFilter(f)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              roleFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} users</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Plan</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Joined</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-10 text-muted-foreground text-xs">No users found</td>
              </tr>
            ) : (
              filtered.map((u) => {
                const plan = PLAN_CONFIG[u.subscription_plan] || PLAN_CONFIG.free;
                return (
                  <tr key={u.id} className="border-b border-border/50 hover:bg-secondary/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                          {(u.full_name || u.email || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{u.full_name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary capitalize">{u.role || "user"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${plan.cls}`}>{plan.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.created_date ? moment(u.created_date).format("MMM D, YYYY") : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}