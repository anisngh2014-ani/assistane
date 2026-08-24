import React, { useState, useEffect } from "react";
import { assistane } from "@/api/assistaneClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, RefreshCw, Link2, Zap, Clock, Trash2 } from "lucide-react";
import moment from "moment";
import { toast } from "@/components/ui/use-toast";

export default function SupportCodePanel({ accountId = null, accountToken = null }) {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState(null);

  const getAccountCredentials = () => ({
    accountId: accountId || localStorage.getItem("accountId") || localStorage.getItem("accountDbId") || "",
    accountToken: accountToken || localStorage.getItem("accountToken") || "",
  });

  const requireCustomerCredentials = () => {
    if (!accountId && !accountToken) return true;
    const creds = getAccountCredentials();
    if (creds.accountId && creds.accountToken) return true;
    toast({
      title: "Please sign in again",
      description: "Your customer session is missing. Log in again and generate a new code.",
      variant: "destructive",
    });
    return false;
  };

  const loadCodes = async () => {
    if (!requireCustomerCredentials()) return;
    const creds = getAccountCredentials();
    try {
      const res = await assistane.functions.invoke("deviceApi", {
        endpoint: "active-support-codes",
        account_id: creds.accountId || undefined,
        account_token: creds.accountToken || undefined,
      });
      setCodes(res.data.codes || []);
    } catch (err) {
      if (/401|403|unauthorized|invalid account session|missing account_token/i.test(err.message || "")) {
        toast({
          title: "Please sign in again",
          description: "Your customer session expired. Log in again to generate support codes.",
          variant: "destructive",
        });
      }
    }
  };

  useEffect(() => { loadCodes(); }, [accountId, accountToken]);

  const createCode = async () => {
    setLoading(true);
    const currentLabel = label.trim();
    try {
      if (!requireCustomerCredentials()) return;
      const creds = getAccountCredentials();
      const res = await assistane.functions.invoke("deviceApi", {
        endpoint: "generate-support-code",
        account_id: creds.accountId || undefined,
        account_token: creds.accountToken || undefined,
        label: currentLabel,
        expiry_hours: 24,
      });
      if (res.data.success) {
        setLabel("");
        const newCode = {
          id: res.data.code?.id || `temp-${Date.now()}`,
          short_code: res.data.short_code,
          label: currentLabel,
          expires_at: res.data.expires_at,
          used: false,
        };
        setCodes([newCode]);
        setTimeout(() => loadCodes(), 1500);
      }
    } catch (err) {
      if (/401|403|unauthorized|invalid account session|missing account_token/i.test(err.message || "")) {
        toast({
          title: "Please sign in again",
          description: "Your customer session expired. Log in again to generate support codes.",
          variant: "destructive",
        });
      } else {
        alert("Failed to generate code: " + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const deleteCode = async (id) => {
    try {
      const creds = getAccountCredentials();
      await assistane.functions.invoke("deviceApi", {
        endpoint: "expire-support-code",
        id,
        account_id: creds.accountId || undefined,
        account_token: creds.accountToken || undefined,
      });
    } catch (_) {}
    setCodes((prev) => prev.filter((c) => c.id !== id));
  };

  const getShortCode = (record) => {
    const value = String(record?.short_code || "").trim();
    return /^\d{6}$/.test(value) ? value : "";
  };

  const getSupportLink = (shortCode) => `https://connect.assistane.com/?code=${encodeURIComponent(shortCode)}`;

  const copyCode = (shortCode) => {
    if (!shortCode) {
      toast({ title: "Code not ready", description: "Generate a new support code and try again.", variant: "destructive" });
      return;
    }
    navigator.clipboard.writeText(shortCode);
    setCopied(`code:${shortCode}`);
    toast({ title: "Code copied", description: "Share this 6-digit code with your client." });
    setTimeout(() => setCopied(null), 2000);
  };

  const copyLink = (shortCode) => {
    if (!shortCode) {
      toast({ title: "Code not ready", description: "Generate a new support code and try again.", variant: "destructive" });
      return;
    }
    navigator.clipboard.writeText(getSupportLink(shortCode));
    setCopied(`link:${shortCode}`);
    toast({ title: "Support link copied", description: "Share this link with your client." });
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-primary" />
        <h3 className="font-heading font-semibold text-sm">Support Codes</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Generate a 6-digit support code to share with your client. They can open the support link or visit connect.assistane.com, enter the code, and download the correct Agent installer.
      </p>

      <div className="flex gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. John's PC) - optional"
          className="h-9 text-xs bg-secondary border-border"
        />
        <Button size="sm" className="h-9 text-xs gap-1.5 shrink-0" onClick={createCode} disabled={loading}>
          {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          New Code
        </Button>
      </div>

      {codes.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No active codes. Generate one above.</p>
      ) : (
        <div className="space-y-2">
          {codes.map((c) => {
            const shortCode = getShortCode(c);
            return (
              <div key={c.id} className="flex items-center gap-3 bg-secondary/60 rounded-lg px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-base text-foreground tracking-widest">{shortCode || "------"}</span>
                    {c.label && <span className="text-xs text-muted-foreground truncate">{c.label}</span>}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                    <Clock className="w-3 h-3" />
                    Expires {moment(c.expires_at).fromNow()}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyCode(shortCode)} title="Copy 6-digit code" disabled={!shortCode}>
                    {copied === `code:${shortCode}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] gap-1" onClick={() => copyLink(shortCode)} title="Copy support link" disabled={!shortCode}>
                    {copied === `link:${shortCode}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link2 className="w-3.5 h-3.5" />}
                    Copy Link
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteCode(c.id)} title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
