import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Link as LinkIcon, KeyRound, CheckCircle2 } from "lucide-react";
import SupportCodePanel from "@/components/devices/SupportCodePanel";
import CustomerAppLayout from "@/components/layout/CustomerAppLayout";

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

export default function CustomerRegisterDevice() {
  const navigate = useNavigate();
  const [accountId, setAccountId] = useState("");
  const [accountToken, setAccountToken] = useState("");

  useEffect(() => {
    const savedToken = localStorage.getItem("accountToken");
    const savedId = localStorage.getItem("accountId") || localStorage.getItem("accountDbId");
    if (!savedToken || !savedId) {
      navigate("/user-login");
      return;
    }
    setAccountToken(savedToken);
    setAccountId(savedId);
  }, [navigate]);

  if (!accountToken || !accountId) {
    return (
      <CustomerAppLayout>
        <div className="flex items-center justify-center h-96">
          <div className="w-7 h-7 border-2 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      </CustomerAppLayout>
    );
  }

  return (
    <CustomerAppLayout>
      <div className="max-w-lg mx-auto space-y-6">
        <div>
          <button
            onClick={() => navigate("/customer-dashboard")}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </button>
          <h1 className="font-heading font-bold text-2xl tracking-tight">Add a Device</h1>
          <p className="text-muted-foreground text-sm mt-1">Generate a support code and share the Assistane connect page</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 space-y-6">
          <Step number="1" icon={KeyRound} title="Generate your support code">
            <p className="text-xs text-muted-foreground">Generate one 6-digit support code below. Only one active code stays available at a time.</p>
          </Step>

          <Step number="2" icon={LinkIcon} title="Share connect.assistane.com">
            <p className="text-xs text-muted-foreground">Send the client the support link or tell them to visit connect.assistane.com and enter the code. The page validates the code before downloading the correct Agent installer.</p>
          </Step>

          <Step number="3" icon={CheckCircle2} title="Device appears automatically">
            <p className="text-xs text-muted-foreground">After installation, the Agent uses the support code from the connect page automatically and the device shows up on your dashboard within seconds.</p>
          </Step>
        </div>

        <SupportCodePanel accountId={accountId} accountToken={accountToken} />

        <Button onClick={() => navigate("/customer-dashboard")} variant="outline" className="w-full h-10 text-sm">
          Go to Dashboard
        </Button>
      </div>
    </CustomerAppLayout>
  );
}
