import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Monitor,
  Power,
  Radio,
  Zap,
  Ban,
  Image,
  Video,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function DeviceControls({ device, onUpdate }) {
  const [loading, setLoading] = useState(null);
  const { toast } = useToast();

  const handleCommand = async (action, params = {}) => {
    setLoading(action);
    try {
      const response = await base44.functions.invoke("deviceApi", {
        method: "POST",
        endpoint: action,
        device_id: device.id,
        ...params,
      });

      if (response.data.success) {
        toast({ title: "Success", description: `${action} executed` });
        if (onUpdate) onUpdate();
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err.message || "Command failed",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const updateConfig = async (config) => {
    setLoading("config");
    try {
      const response = await base44.functions.invoke("deviceApi", {
        method: "POST",
        endpoint: "device-config",
        device_id: device.id,
        ...config,
      });

      if (response.data.success) {
        toast({ title: "Config updated", description: "Changes applied" });
        if (onUpdate) onUpdate();
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err.message || "Config update failed",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-4 p-4 bg-card rounded-lg border border-border">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <Zap className="w-4 h-4 text-primary" />
        Device Controls
      </h3>

      {/* Special Keys */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-9"
          disabled={loading === "ctrl-alt-del"}
          onClick={() => handleCommand("send-special-key", { key: "ctrl-alt-del" })}
        >
          {loading === "ctrl-alt-del" ? (
            <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Radio className="w-3 h-3" />
          )}
          Ctrl+Alt+Del
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-9"
          disabled={loading === "alt-tab"}
          onClick={() => handleCommand("send-special-key", { key: "alt-tab" })}
        >
          {loading === "alt-tab" ? (
            <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Radio className="w-3 h-3" />
          )}
          Alt+Tab
        </Button>
      </div>

      {/* Reboot Options */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-9 text-orange-500 hover:text-orange-600"
          disabled={loading === "reboot"}
          onClick={() => {
            if (window.confirm("Reboot device?")) {
              handleCommand("reboot-device");
            }
          }}
        >
          {loading === "reboot" ? (
            <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Power className="w-3 h-3" />
          )}
          Reboot
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-9 text-orange-500 hover:text-orange-600"
          disabled={loading === "safe-mode"}
          onClick={() => {
            if (window.confirm("Reboot in Safe Mode?")) {
              handleCommand("reboot-device", { safe_mode: true });
            }
          }}
        >
          {loading === "safe-mode" ? (
            <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <AlertCircle className="w-3 h-3" />
          )}
          Safe Mode
        </Button>
      </div>

      {/* Input & Performance */}
      <div className="space-y-3 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium flex items-center gap-2">
            <Ban className="w-3.5 h-3.5" />
            Remote Input
          </label>
          <Button
            size="sm"
            variant={device.remote_input_disabled ? "outline" : "secondary"}
            className="h-7 text-xs"
            disabled={loading === "config"}
            onClick={() =>
              updateConfig({
                remote_input_disabled: !device.remote_input_disabled,
              })
            }
          >
            {loading === "config" ? (
              <div className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
            ) : device.remote_input_disabled ? (
              "Disabled"
            ) : (
              "Enabled"
            )}
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-xs font-medium flex items-center gap-2">
            <Image className="w-3.5 h-3.5" />
            Wallpaper
          </label>
          <Button
            size="sm"
            variant={device.wallpaper_enabled ? "secondary" : "outline"}
            className="h-7 text-xs"
            disabled={loading === "config"}
            onClick={() =>
              updateConfig({ wallpaper_enabled: !device.wallpaper_enabled })
            }
          >
            {loading === "config" ? (
              <div className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
            ) : device.wallpaper_enabled ? (
              "On"
            ) : (
              "Off"
            )}
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-xs font-medium flex items-center gap-2">
            <Video className="w-3.5 h-3.5" />
            Video Quality
          </label>
          <select
            className="h-7 text-xs px-2 rounded bg-input border border-border"
            value={device.video_quality || "high"}
            disabled={loading === "config"}
            onChange={(e) => updateConfig({ video_quality: e.target.value })}
          >
            <option value="ultra">Ultra</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Screen Resolution */}
      <div className="space-y-2 pt-2 border-t border-border">
        <label className="text-xs font-medium flex items-center gap-2">
          <Monitor className="w-3.5 h-3.5" />
          Screen Resolution
        </label>
        <div className="grid grid-cols-3 gap-2 text-xs">
          {[
            { w: 1920, h: 1080, label: "FHD" },
            { w: 1366, h: 768, label: "HD" },
            { w: 1024, h: 768, label: "XGA" },
          ].map(({ w, h, label }) => (
            <Button
              key={label}
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={loading === "resolution"}
              onClick={() => handleCommand("set-screen-resolution", { width: w, height: h })}
            >
              {loading === "resolution" ? (
                <div className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                label
              )}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}