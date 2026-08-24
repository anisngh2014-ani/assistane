import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { assistane } from "@/api/assistaneClient";
import { Monitor, MonitorDown, Loader2, AlertCircle, CheckCircle2, KeyRound } from "lucide-react";

function detectOS() {
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua) && !/iPhone|iPad/.test(ua)) return "macos";
  if (/Win/i.test(ua)) return "windows";
  return "unknown";
}

function normalizeSupportCode(value) {
  const raw = String(value || "").trim();
  try {
    const parsed = new URL(raw);
    const fromUrl = parsed.searchParams.get("code");
    if (fromUrl) return normalizeSupportCode(fromUrl);
  } catch (_) {}
  const match = raw.match(/\b\d{6}\b/);
  return match ? match[0] : raw.replace(/\D/g, "").slice(0, 6);
}

function statusText(status, os) {
  if (status === "validating") return "Checking support code...";
  if (status === "downloading") return "Download starting automatically...";
  if (status === "ready") return os === "unknown" ? "Open this page on a Windows or macOS computer." : `${os === "windows" ? "Windows" : "macOS"} detected. Ready to download.`;
  return "Enter the support code from your technician.";
}

export default function Connect() {
  const queryCode = useMemo(() => new URLSearchParams(window.location.search).get("code") || "", []);
  const [os, setOs] = useState("unknown");
  const [code, setCode] = useState(() => normalizeSupportCode(queryCode));
  const [status, setStatus] = useState(queryCode ? "validating" : "idle");
  const [error, setError] = useState("");
  const [downloadInfo, setDownloadInfo] = useState(null);

  useEffect(() => {
    setOs(detectOS());
  }, []);

  const canAutoDownload = os === "windows" || os === "macos";
  const cleanCode = normalizeSupportCode(code);

  async function requestDownload(platform = os, rawCode = cleanCode) {
    const normalized = normalizeSupportCode(rawCode);
    if (!/^\d{6}$/.test(normalized)) {
      setError("Enter a valid 6-digit support code.");
      setStatus("idle");
      return;
    }
    if (platform !== "windows" && platform !== "macos") {
      setError("We could not detect Windows or macOS on this device. Please open this page from the remote Windows or macOS computer.");
      setStatus("ready");
      return;
    }

    setError("");
    setStatus("validating");
    try {
      const res = await assistane.functions.invoke("deviceApi", {
        endpoint: "agent-bootstrap-download",
        code: normalized,
        platform,
      });
      const data = res?.data || {};
      if (!data.success || !data.download_url) {
        throw new Error(data.error || "Could not prepare the Agent download.");
      }
      setDownloadInfo(data);
      setStatus("downloading");
      window.location.assign(data.download_url);
    } catch (err) {
      setError(err.message || "Invalid or expired support code.");
      setStatus("idle");
    }
  }

  useEffect(() => {
    if (!queryCode || !cleanCode) return;
    if (!canAutoDownload) {
      setStatus("ready");
      setError("We could not detect Windows or macOS on this device. Please open this page from the remote Windows or macOS computer.");
      return;
    }
    const timer = setTimeout(() => requestDownload(os, cleanCode), 500);
    return () => clearTimeout(timer);
  }, [queryCode, cleanCode, canAutoDownload, os]);

  const submit = (event) => {
    event.preventDefault();
    requestDownload(os, cleanCode);
  };

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
              Enter your support code. Assistane verifies it, detects this computer, and downloads the correct Agent installer.
            </p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-center gap-2 text-primary text-sm font-semibold">
              {status === "validating" || status === "downloading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {statusText(status, os)}
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive text-left">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {os === "unknown" && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 text-left">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                We could not detect Windows or macOS on this device. Open this page from the remote computer that needs the Agent installed.
              </div>
            )}

            <form onSubmit={submit} className="space-y-3">
              <label className="text-xs font-semibold text-left block" htmlFor="support-code">Support Code</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="support-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="123456"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="w-full h-12 rounded-xl border border-border bg-secondary/70 pl-9 pr-3 text-sm outline-none focus:border-primary"
                  />
                </div>
                <Button type="submit" className="h-12 px-4" disabled={status === "validating" || status === "downloading"}>
                  {status === "validating" || status === "downloading" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Download"}
                </Button>
              </div>
            </form>

            <div className="bg-secondary/60 rounded-xl p-3 text-left space-y-1">
              <p className="text-xs font-semibold">After downloading:</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Run the Agent installer.</li>
                <li>Open Assistane Agent if it does not open automatically.</li>
                <li>The Agent uses this support code automatically.</li>
                <li>If the code was not used on this page, the Agent will ask for it.</li>
              </ol>
            </div>

            {downloadInfo?.filename && (
              <p className="text-[10px] text-muted-foreground break-all">
                Download prepared: {downloadInfo.filename}
              </p>
            )}

            <p className="text-[10px] text-muted-foreground">
              Windows 10/11 and macOS 10.13+ are supported.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

