import React, { useState } from "react";
import { Monitor, Laptop, Server, Wifi, WifiOff, Trash2, ExternalLink, Clock, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import moment from "moment";

const osConfig = {
  Windows: { icon: Laptop, color: "text-sky-400", bg: "bg-sky-400/10" },
  macOS: { icon: Laptop, color: "text-violet-400", bg: "bg-violet-400/10" },
  Linux: { icon: Server, color: "text-amber-400", bg: "bg-amber-400/10" },
  "Chrome OS": { icon: Monitor, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  Other: { icon: Monitor, color: "text-muted-foreground", bg: "bg-muted" },
};

export default function DeviceManagementCard({ device, onConnect, onDelete }) {
  const isOnline = device.online_status === "online";
  const cfg = osConfig[device.operating_system] || osConfig.Other;
  const Icon = cfg.icon;

  return (
    <div className={`relative bg-card border rounded-xl p-5 flex flex-col gap-4 transition-all duration-200 hover:shadow-lg hover:shadow-black/20 ${
      isOnline ? "border-emerald-500/20 hover:border-emerald-500/40" : "border-border hover:border-border/80"
    }`}>
      {/* Online pulse dot */}
      {isOnline && (
        <span className="absolute top-4 right-4">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
        </span>
      )}

      {/* Top row */}
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
          <Icon className={`w-5 h-5 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-heading font-semibold text-sm truncate pr-5">{device.device_name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{device.operating_system}</p>
        </div>
      </div>

      {/* Meta */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Status</span>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
            isOnline ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"
          }`}>
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Last seen</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {device.last_seen ? moment(device.last_seen).fromNow() : "Never"}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Device ID</span>
          <span className="text-xs font-mono text-muted-foreground">
            {device.device_uid ? `${device.device_uid.slice(0, 10)}…` : "—"}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-border">
        <Button
          onClick={() => isOnline && onConnect?.(device)}
          disabled={!isOnline}
          size="sm"
          className="flex-1 h-8 text-xs font-semibold gap-1.5"
          variant={isOnline ? "default" : "secondary"}
        >
          <MonitorPlay className="w-3.5 h-3.5" />
          {isOnline ? "View Screen" : "Offline"}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-heading">Delete device?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground text-sm">
                <strong className="text-foreground">{device.device_name}</strong> will be permanently removed. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-9 text-xs">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(device)}
                className="h-9 text-xs bg-destructive hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
