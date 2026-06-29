import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Monitor, Download, Apple, CheckCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const VIEWER_DOWNLOADS = {
  windows: "https://github.com/anisngh2014-ani/assistane/releases/download/viewer-latest/Assistane.Viewer.Setup.exe",
  macos: "https://github.com/anisngh2014-ani/assistane/releases/download/viewer-latest/Assistane.Viewer.dmg",
};

function detectOS() {
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua) && !/iPhone|iPad/.test(ua)) return "mac";
  if (/Win/i.test(ua)) return "windows";
  return "unknown";
}

export default function ViewerDownload() {
  const navigate = useNavigate();
  const [detectedOS, setDetectedOS] = useState("unknown");
  const [downloading, setDownloading] = useState(false);

  const startDownload = (platform) => {
    const url = platform === "mac" ? VIEWER_DOWNLOADS.macos : platform === "windows" ? VIEWER_DOWNLOADS.windows : "";
    if (url) window.location.href = url;
  };

  useEffect(() => {
    const os = detectOS();
    setDetectedOS(os);
    if (os === "windows" || os === "mac") {
      setDownloading(true);
      setTimeout(() => startDownload(os), 500);
    }
  }, []);

  const steps = [
    { n: 1, title: "Download Viewer App", desc: "Download and install the Assistane Viewer app on this device (the controller's machine)." },
    { n: 2, title: "Install & Launch", desc: "Run the installer. The viewer app will register itself to handle assistane:// links automatically." },
    { n: 3, title: "Connect from Dashboard", desc: "Go to any device on your dashboard, click Connect — the viewer app launches instantly with full remote control." },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="font-heading font-bold text-xl tracking-tight">Assistane Viewer</h1>
          <p className="text-muted-foreground text-sm">Install on your device to enable native remote control</p>
        </div>
      </div>

      {/* Hero */}
      <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto text-3xl">
          🖥️
        </div>
        <div>
          <h2 className="font-heading font-bold text-xl mb-1">Native Viewer App</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            A dedicated Electron app that gives you the full remote desktop experience — instant connect, clipboard sync, file transfer, and full keyboard/mouse control.
          </p>
        </div>
        {downloading && (
          <p className="text-xs text-primary font-semibold">Detected your OS. Download starting automatically...</p>
        )}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 flex-wrap">
          {detectedOS === "mac" ? (
            <>
              <a href={VIEWER_DOWNLOADS.macos} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">
                <Apple className="w-4 h-4" />
                Download for macOS
                <span className="text-[10px] bg-primary-foreground/20 px-1.5 py-0.5 rounded">Recommended</span>
              </a>
              <a href={VIEWER_DOWNLOADS.windows} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary border border-border font-semibold text-sm hover:bg-secondary/80 transition-colors">
                <Download className="w-4 h-4" />
                Download for Windows
              </a>
            </>
          ) : (
            <>
              <a href={VIEWER_DOWNLOADS.windows} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">
                <Download className="w-4 h-4" />
                Download for Windows
                {detectedOS === "windows" && <span className="text-[10px] bg-primary-foreground/20 px-1.5 py-0.5 rounded">Recommended</span>}
              </a>
              <a href={VIEWER_DOWNLOADS.macos} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary border border-border font-semibold text-sm hover:bg-secondary/80 transition-colors">
                <Apple className="w-4 h-4" />
                Download for macOS
              </a>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">v1.0.0 · Windows 7/8/10/11+ · macOS 10.13+</p>
      </div>

      {/* How it works */}
      <div className="space-y-3">
        <h3 className="font-heading font-semibold text-sm">How it works</h3>
        <div className="space-y-2">
          {steps.map(s => (
            <div key={s.n} className="flex gap-4 p-4 bg-card border border-border rounded-xl">
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary font-bold text-sm flex items-center justify-center shrink-0">
                {s.n}
              </div>
              <div>
                <p className="font-semibold text-sm">{s.title}</p>
                <p className="text-muted-foreground text-xs mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h3 className="font-heading font-semibold text-sm">Viewer App Features</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            "Instant connect via protocol link",
            "Full keyboard & mouse control",
            "Clipboard sync (both ways)",
            "File drag & drop transfer",
            "Connection quality indicator",
            "Auto-reconnect on drop",
            "Black screen / privacy mode",
            "Chat with device user",
            "Ctrl+Alt+Del, Alt+Tab, etc.",
            "Screen resolution control",
            "Video quality settings",
            "Session time tracking",
          ].map(f => (
            <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* Already installed notice */}
      <div className="bg-secondary/50 border border-border rounded-xl p-4 text-center space-y-2">
        <p className="text-sm font-medium">Already installed?</p>
        <p className="text-xs text-muted-foreground">Go back to your dashboard and click <strong>Connect</strong> on any online device. The viewer app will launch automatically.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => navigate("/")}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
