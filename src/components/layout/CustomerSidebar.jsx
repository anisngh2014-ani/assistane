import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Monitor, Plus, Clock, User, LogOut, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const navItems = [
  { label: "Dashboard", path: "/customer-dashboard", icon: LayoutDashboard },
  { label: "Devices", path: "/customer-dashboard?tab=Devices", icon: Monitor },
  { label: "Register Device", path: "/customer-register-device", icon: Plus },
  { label: "Session History", path: "/customer-dashboard?tab=Sessions", icon: Clock },
  { label: "Profile", path: "/customer-dashboard?tab=Profile", icon: User },
];

export default function CustomerSidebar({ open, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const handleLogout = () => {
    localStorage.removeItem("accountToken");
    localStorage.removeItem("accountId");
    localStorage.removeItem("accountName");
    localStorage.removeItem("accountEmail");
    toast({ title: "Logged out successfully" });
    navigate("/account-login");
  };

  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path.split("?")[0]);
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
            <img src="https://media.base44.com/images/public/6a32eca12dbb32f7f5ec2a11/8ac54a3e2_Logo.png" alt="RemotePilot" className="h-36 w-60 object-contain mix-blend-lighten" />
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
            const active = isActive(item.path);
            return (
              <button
                key={item.label}
                onClick={() => {
                  navigate(item.path);
                  onClose();
                }}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all touch-manipulation active:scale-[0.98] w-full ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
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