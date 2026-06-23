import React, { useEffect, useState } from "react";
import { Download, Laptop, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const AGENT_DOWNLOADS = {
  windows: "https://github.com/anisngh2014-ani/assistane/releases/download/agent-latest/Assistane%20Agent%20Setup.exe",
  macos: "https://github.com/anisngh2014-ani/assistane/releases/download/agent-latest/Assistane%20Agent.dmg",
};

export default function DownloadAgent() {
  const [os, setOs] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    let detectedOS = null;

    if (ua.includes("win")) detectedOS = "windows";
    else if (ua.includes("mac")) detectedOS = "macos";

    setOs(detectedOS);

    // Auto-start download if OS detected
    if (detectedOS === "windows" || detectedOS === "macos") {
      setDownloading(true);
      setTimeout(() => startDownload(detectedOS), 500);
    }
  }, []);

  const startDownload = (platform) => {
    const downloadUrls = {
      windows: AGENT_DOWNLOADS.windows,
      macos: AGENT_DOWNLOADS.macos,
    };

    if (downloadUrls[platform]) {
      window.location.href = downloadUrls[platform];
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-16 px-4">
      <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-6">
        <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto">
          <Download className="w-8 h-8 text-primary" />
        </div>

        <div>
          <h1 className="font-heading font-bold text-2xl mb-2">Download Assistane Agent</h1>
          <p className="text-muted-foreground">Background service for remote support</p>
        </div>

        {os && (
          <div className="flex items-center justify-center gap-2 bg-primary/10 border border-primary/30 rounded-lg p-4">
            <CheckCircle className="w-5 h-5 text-primary" />
            <span className="font-semibold text-primary">
              {os === "windows" ? "Windows" : os === "macos" ? "macOS" : "Linux"} detected
            </span>
          </div>
        )}

        {!os && (
          <div className="flex items-center justify-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            <span className="font-semibold text-yellow-600">OS not detected — select manually below</span>
          </div>
        )}

        {downloading && (
          <div className="space-y-2">
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div className="bg-primary h-full w-full animate-pulse"></div>
            </div>
            <p className="text-sm text-muted-foreground">Download starting…</p>
          </div>
        )}

        <div className="space-y-3 pt-4">
          <p className="text-sm text-muted-foreground">Or choose your platform:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              onClick={() => startDownload("windows")}
              variant={os === "windows" ? "default" : "outline"}
              className="h-12 gap-2"
            >
              <Laptop className="w-4 h-4" />
              Windows
            </Button>
            <Button
              onClick={() => startDownload("macos")}
              variant={os === "macos" ? "default" : "outline"}
              className="h-12 gap-2"
            >
              <Laptop className="w-4 h-4" />
              macOS
            </Button>
          </div>
        </div>

        <div className="bg-secondary/50 rounded-lg p-4 text-left space-y-2 text-xs text-muted-foreground">
          <p>✓ Install as background service</p>
          <p>✓ Auto-start on login</p>
          <p>✓ Minimal system impact</p>
        </div>
      </div>
    </div>
  );
}
