import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Monitor, Apple, MonitorDown, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

const AGENT_DOWNLOADS = {
  windows: "https://github.com/anisngh2014-ani/assistane/releases/download/agent-latest/Assistane.Agent.Setup.exe",
  macos: "https://github.com/anisngh2014-ani/assistane/releases/download/agent-latest/Assistane.Agent.dmg",
};

function detectOS() {
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua) && !/iPhone|iPad/.test(ua)) return "macos";
  if (/Win/i.test(ua)) return "windows";
  return "unknown";
}

export default function Connect() {
  const [os, setOs] = useState("unknown");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setOs(detectOS());
  }, []);

  const downloadUrl = useMemo(() => {
    if (os === "macos") return AGENT_DOWNLOADS.macos;
    if (os === "windows") return AGENT_DOWNLOADS.windows;
    return "";
  }, [os]);

  const startDownload = (platform = os) => {
    const url = platform === "macos" ? AGENT_DOWNLOADS.macos : platform === "windows" ? AGENT_DOWNLOADS.windows : "";
    if (!url) return;
    setDownloading(true);
    window.location.href = url;
  };

  useEffect(() => {
    if (!downloadUrl) return;
    const timer = setTimeout(() => startDownload(os), 600);
    return () => clearTimeout(timer);
  }, [downloadUrl, os]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Monitor className="w-4 h-4 text-primary" />
        </div>
        <span className="font-heading font-bold text-sm tracking-tight">Assistane</span>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <MonitorDown className="w-8 h-8 text-primary" />
          </div>

          <div className="space-y-2">
            <h1 className="font-heading font-bold text-3xl tracking-tight">Download Assistane Agent</h1>
            <p className="text-muted-foreground text-sm">
              The correct Agent installer will download automatically. After installation, open Assistane Agent and enter the 6-digit support code from your technician.
            </p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
            {downloadUrl ? (
              <div className="flex items-center justify-center gap-2 text-primary text-sm font-semibold">
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {downloading ? "Download starting automatically..." : `${os === "windows" ? "Windows" : "macOS"} detected`}
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 text-left">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                We could not detect your operating system. Choose the correct installer below.
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Button
                className="w-full h-12 text-sm gap-2"
                variant={os === "windows" ? "default" : "secondary"}
                onClick={() => startDownload("windows")}
              >
                <MonitorDown className="w-5 h-5" />
                Download for Windows (.exe)
                {os === "windows" && <span className="ml-auto text-[10px] bg-primary-foreground/20 px-1.5 py-0.5 rounded">Recommended</span>}
              </Button>

              <Button
                className="w-full h-12 text-sm gap-2"
                variant={os === "macos" ? "default" : "secondary"}
                onClick={() => startDownload("macos")}
              >
                <Apple className="w-5 h-5" />
                Download for macOS (.dmg)
                {os === "macos" && <span className="ml-auto text-[10px] bg-primary-foreground/20 px-1.5 py-0.5 rounded">Recommended</span>}
              </Button>
            </div>

            <div className="bg-secondary/60 rounded-xl p-3 text-left space-y-1">
              <p className="text-xs font-semibold">After downloading:</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Run the Agent installer.</li>
                <li>Open Assistane Agent if it does not open automatically.</li>
                <li>Enter the 6-digit support code given by your technician.</li>
                <li>Your device will appear on the technician dashboard.</li>
              </ol>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Windows 7/8/10/11+ and macOS 10.13+ are supported.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
