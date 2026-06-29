import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Apple, MonitorDown, KeyRound, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import SupportCodePanel from "@/components/devices/SupportCodePanel";

const AGENT_DOWNLOADS = {
  windows: "https://github.com/anisngh2014-ani/assistane/releases/download/agent-latest/Assistane.Agent.Setup.exe",
  macos: "https://github.com/anisngh2014-ani/assistane/releases/download/agent-latest/Assistane.Agent.dmg",
};

function Step({ number, icon: Icon, title, children }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
          {number}
        </div>
      </div>
      <div className="flex-1 pb-2">
        <h3 className="font-heading font-semibold text-sm flex items-center gap-2 mb-2">
          <Icon className="w-4 h-4 text-primary" />
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

export default function RegisterDevice() {
  const navigate = useNavigate();

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Dashboard
        </Link>
        <h1 className="font-heading font-bold text-2xl tracking-tight">Add a Device</h1>
        <p className="text-muted-foreground text-sm mt-1">Download the agent, enter the support code, and it connects automatically</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-6">
        <Step number="1" icon={Download} title="Download the agent">
          <p className="text-xs text-muted-foreground mb-3">Install the Assistane Agent on the computer you want to control.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="secondary" className="flex-1 h-10 text-sm gap-2" asChild>
              <a href={AGENT_DOWNLOADS.windows}>
                <MonitorDown className="w-4 h-4" /> Windows
              </a>
            </Button>
            <Button variant="secondary" className="flex-1 h-10 text-sm gap-2" asChild>
              <a href={AGENT_DOWNLOADS.macos}>
                <Apple className="w-4 h-4" /> macOS
              </a>
            </Button>
          </div>
        </Step>

        <Step number="2" icon={KeyRound} title="Generate and copy your support code">
          <p className="text-xs text-muted-foreground">Generate one 6-digit support code below. Your client opens the Agent download link, installs the Agent, then enters this code inside the Agent.</p>
        </Step>

        <Step number="3" icon={CheckCircle2} title="Device connects automatically">
          <p className="text-xs text-muted-foreground">Client enters the support code in the Agent and the device appears on your dashboard within seconds.</p>
        </Step>
      </div>

      <SupportCodePanel />

      <Button onClick={() => navigate("/")} variant="outline" className="w-full h-10 text-sm">
        Go to Dashboard
      </Button>
    </div>
  );
}
