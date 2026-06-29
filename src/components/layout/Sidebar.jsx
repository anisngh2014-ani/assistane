import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Monitor, Plus, Clock, User, LogOut, X, ShieldCheck, Settings, Download } from "lucide-react";
import { base44 } from "@/api/base44Client";

const navItems = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Devices", path: "/devices", icon: Monitor },
  { label: "Register Device", path: "/register-device", icon: Plus },
  { label: "Session History", path: "/sessions", icon: Clock },
  { label: "Profile", path: "/profile", icon: User },
  { label: "Download Viewer", path: "/viewer-download", icon: Download },
];

export default function Sidebar({ open, onClose }) {
  const location = useLocation();

  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then((me) => {
      setIsAdmin(me?.role === "admin");
      setUser(me);
    });
  }, []);

  const handleLogout = () => {
    base44.auth.logout("/login");
  };

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden touch-manipulation"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-card border-r border-border z-50 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-0 py-0 border-b border-border shrink-0 h-40 w-60">
          <div className="flex items-center h-full w-full">
            <img src="https://media.base44.com/images/public/6a32eca12dbb32f7f5ec2a11/8ac54a3e2_Logo.png" alt="Assistane" className="h-36 w-60 object-contain mix-blend-lighten" />
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1 text-muted-foreground hover:text-foreground active:scale-95 transition-transform touch-manipulation"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all touch-manipulation active:scale-[0.98] ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}

          {isAdmin && !user?.created_by_id && (
            <>
              <Link
                to="/owner"
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all touch-manipulation active:scale-[0.98] ${
                  location.pathname === "/owner"
                    ? "bg-purple-400/10 text-purple-400"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                Owner
              </Link>
              <Link
                to="/workspace-setup"
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all touch-manipulation active:scale-[0.98] ${
                  location.pathname === "/workspace-setup"
                    ? "bg-blue-400/10 text-blue-400"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Settings className="w-4 h-4 shrink-0" />
                Workspace
              </Link>
            </>
          )}
          {isAdmin && (
            <Link
              to="/admin"
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all touch-manipulation active:scale-[0.98] ${
                location.pathname === "/admin"
                  ? "bg-amber-400/10 text-amber-400"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              Admin
            </Link>
          )}
        </nav>



        {/* Sign out */}
        <div className="p-3 border-t border-border shrink-0">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all w-full touch-manipulation active:scale-[0.98]"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}