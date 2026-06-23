import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Monitor, Apple, MonitorDown, ArrowRight, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

const AGENT_DOWNLOADS = {
  windows: "https://github.com/anisngh2014-ani/assistane/releases/download/agent-latest/Assistane%20Agent%20Setup.exe",
  macos: "https://github.com/anisngh2014-ani/assistane/releases/download/agent-latest/Assistane%20Agent.dmg",
};

function detectOS() {
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua) && !/iPhone|iPad/.test(ua)) return "mac";
  if (/Win/i.test(ua)) return "windows";
  return "unknown";
}

const STEPS = [
  { n: 1, label: "Enter the support code" },
  { n: 2, label: "Download the app" },
  { n: 3, label: "Run it â€” you're connected!" },
];

export default function Connect() {
  const [code, setCode] = useState("");
  const [step, setStep] = useState("enter"); // enter | loading | ready | error
  const [errorMsg, setErrorMsg] = useState("");
  const [downloading, setDownloading] = useState(false);

  // Pre-fill code from URL ?code=123456
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("code");
    if (c) setCode(c.trim());
  }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const trimmed = code.trim().replace(/\s/g, "");
    if (trimmed.length !== 6) {
      setErrorMsg("Please enter the 6-digit support code.");
      return;
    }
    setStep("loading");
    setErrorMsg("");
    try {
      const res = await base44.functions.invoke("resolveSupportCode", { code: trimmed });
      const data = res?.data ?? res;
      if (data?.success) {
        setStep("ready");
      } else {
        setErrorMsg(data?.error || "Invalid or expired code. Please ask for a new one.");
        setStep("enter");
      }
    } catch (err) {
      setErrorMsg(err?.response?.data?.error || "Could not verify the code. Please try again.");
      setStep("enter");
    }
  };

  const detectedOS = detectOS();
  const winUrl = AGENT_DOWNLOADS.windows;
  const macUrl = AGENT_DOWNLOADS.macos;

  useEffect(() => {
    if (step !== "ready") return;
    const downloadUrl = detectedOS === "mac" ? macUrl : detectedOS === "windows" ? winUrl : "";
    if (!downloadUrl) return;
    setDownloading(true);
    const timer = setTimeout(() => {
      window.location.href = downloadUrl;
    }, 500);
    return () => clearTimeout(timer);
  }, [step, detectedOS, macUrl, winUrl]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <header className="border-b border-border px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Monitor className="w-4 h-4 text-primary" />
        </div>
        <span className="font-heading font-bold text-sm tracking-tight">Assistane</span>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md space-y-8">

          {/* Hero */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Monitor className="w-8 h-8 text-primary" />
            </div>
            <h1 className="font-heading font-bold text-3xl tracking-tight">Remote Support</h1>
            <p className="text-muted-foreground text-sm">
              Your support technician will guide you through these steps.
            </p>
          </div>

          {/* Steps overview */}
          <div className="flex items-center justify-center gap-2">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.n}>
                <div className="flex flex-col items-center gap-1 text-center max-w-[90px]">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    (step === "ready" && s.n <= 3) || (step === "enter" && s.n === 1)
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                  }`}>
                    {s.n}
                  </div>
                  <span className="text-[10px] text-muted-foreground leading-tight">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className="w-6 h-px bg-border mb-3" />}
              </React.Fragment>
            ))}
          </div>

          {/* Main card */}
          {step !== "ready" ? (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <h2 className="font-heading font-semibold text-base">Enter your support code</h2>
              <p className="text-xs text-muted-foreground">
                Your technician will give you a 6-digit code. Enter it below to get started.
              </p>
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="text-center text-2xl font-mono tracking-[0.4em] h-14 bg-secondary border-border"
                  maxLength={6}
                  inputMode="numeric"
                  autoFocus
                  disabled={step === "loading"}
                />
                {errorMsg && (
                  <div className="flex items-center gap-2 text-xs text-red-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {errorMsg}
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full h-11 gap-2"
                  disabled={step === "loading" || code.trim().length !== 6}
                >
                  {step === "loading"
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifyingâ€¦</>
                    : <><ArrowRight className="w-4 h-4" /> Continue</>}
                </Button>
              </form>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-semibold text-sm">Code verified! Download the app</span>
              </div>
              {downloading && (
                <p className="text-xs text-primary font-semibold">Detected your OS. Download starting automatically...</p>
              )}
              <p className="text-xs text-muted-foreground">
                Download and run the Assistane Agent. When it asks for a support code, enter {code}.
              </p>
              {/* OS auto-detected primary button */}
              <div className="flex flex-col gap-3">
                {detectedOS === "mac" ? (
                  <>
                    <a href={macUrl} download>
                      <Button className="w-full h-12 text-sm gap-2">
                        <Apple className="w-5 h-5" />
                        Download for macOS (.dmg)
                        <span className="ml-auto text-[10px] bg-primary-foreground/20 px-1.5 py-0.5 rounded">Recommended</span>
                      </Button>
                    </a>
                    <a href={winUrl} download>
                      <Button variant="secondary" className="w-full h-12 text-sm gap-2">
                        <MonitorDown className="w-5 h-5" />
                        Download for Windows (.exe)
                      </Button>
                    </a>
                  </>
                ) : (
                  <>
                    <a href={winUrl} download>
                      <Button className="w-full h-12 text-sm gap-2">
                        <MonitorDown className="w-5 h-5" />
                        Download for Windows (.exe)
                        {detectedOS === "windows" && <span className="ml-auto text-[10px] bg-primary-foreground/20 px-1.5 py-0.5 rounded">Recommended</span>}
                      </Button>
                    </a>
                    <a href={macUrl} download>
                      <Button variant="secondary" className="w-full h-12 text-sm gap-2">
                        <Apple className="w-5 h-5" />
                        Download for macOS (.dmg)
                      </Button>
                    </a>
                  </>
                )}
              </div>
              {detectedOS !== "unknown" && (
                <p className="text-[10px] text-muted-foreground text-center">
                  {detectedOS === "windows" ? "Supports Windows 7, 8, 8.1, 10, 11 and later" : "Supports macOS 10.13 High Sierra and later"}
                </p>
              )}
              <div className="bg-secondary/60 rounded-xl p-3 space-y-1">
                <p className="text-xs font-semibold">After downloading:</p>
                {detectedOS === "mac" ? (
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Open the .dmg and drag the app to Applications</li>
                    <li>Launch <strong>Assistane Agent</strong> from Applications</li>
                    <li>When prompted for a support code, enter: <code className="bg-secondary px-1 rounded font-mono text-[10px] select-all">{code}</code></li>
                    <li>Your technician will see your device appear</li>
                  </ol>
                ) : (
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Run the downloaded .exe installer</li>
                    <li>When prompted for a support code, enter: <code className="bg-secondary px-1 rounded font-mono text-[10px] select-all">{code}</code></li>
                    <li>Your technician will see your device appear in seconds</li>
                  </ol>
                )}
              </div>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Having trouble? Ask your support technician for a new code.
          </p>
        </div>
      </main>
    </div>
  );
}
