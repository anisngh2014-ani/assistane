import React from "react";
import { Monitor, Laptop, Server, Trash2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import moment from "moment";

const osIcons = {
  Windows: Laptop,
  macOS: Laptop,
  Linux: Server,
  "Chrome OS": Monitor,
  Other: Monitor,
};

export default function DeviceCard({ device, onConnect, onDelete }) {
  const isOnline = device.online_status === "online";
  const Icon = osIcons[device.operating_system] || Monitor;

  const handleConnect = (e) => {
    e.stopPropagation();
    if (isOnline && onConnect) onConnect(device);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (onDelete) onDelete(device);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 hover:border-primary/30 transition-all duration-200 flex flex-col">
      {/* Header with name, OS, and status */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-heading font-semibold text-sm truncate">{device.device_name}</h3>
              <p className="text-xs text-muted-foreground">{device.operating_system}</p>
            </div>
          </div>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold shrink-0 ml-2 ${
          isOnline
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-red-500/10 text-red-400"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
          {isOnline ? "Online" : "Offline"}
        </div>
      </div>

      {/* Status, Last Seen, Device ID rows */}
      <div className="space-y-2 mb-4 pb-4 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Status</span>
          <span className={`text-xs font-semibold flex items-center gap-1 ${isOnline ? "text-emerald-400" : "text-red-400"}`}>
            <span className={`w-1 h-1 rounded-full ${isOnline ? "bg-emerald-400" : "bg-red-400"}`} />
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Last seen</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="text-xs">⏱</span>
            {device.last_seen ? moment(device.last_seen).fromNow() : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Device ID</span>
          <span className="text-xs text-muted-foreground font-mono truncate max-w-[150px]" title={device.device_uid}>
            {device.device_uid?.slice(0, 10)}…
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">IP address</span>
          <span className="text-xs text-muted-foreground font-mono truncate max-w-[150px]" title={device.ip_address || ""}>
            {device.ip_address || "-"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Device type</span>
          <span className="text-xs text-muted-foreground truncate max-w-[150px]">
            {device.brand_name || device.operating_system || "-"}
          </span>
        </div>
        {(device.account_username || device.account_id || device.account_name) && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Account</span>
            <span className="text-xs text-muted-foreground truncate max-w-[150px]" title={device.account_email || ""}>
              {device.account_username || device.account_name || device.account_id}
              {device.account_id ? ` (${device.account_id})` : ""}
            </span>
          </div>
        )}
      </div>

      {/* Last screenshot */}
      {device.last_screenshot_url && (
        <div className="mb-4 rounded-lg overflow-hidden bg-secondary h-28 flex items-center justify-center">
          <img 
            src={device.last_screenshot_url} 
            alt={`${device.device_name} screenshot`}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-auto">
        <Button
          onClick={handleConnect}
          disabled={!isOnline}
          className="flex-1 h-9 text-xs font-semibold gap-1.5 touch-manipulation"
          variant={isOnline ? "default" : "secondary"}
        >
          <Play className="w-3.5 h-3.5" />
          {isOnline ? "View Screen" : "Offline"}
        </Button>
        {onDelete && (
          <button
            onClick={handleDelete}
            className="w-9 h-9 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete device"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
