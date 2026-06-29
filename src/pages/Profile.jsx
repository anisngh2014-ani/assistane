import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { User, Mail, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

export default function Profile() {
  const [user, setUser] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      const [me, devs] = await Promise.all([
        base44.auth.me(),
        base44.entities.Device.list(),
      ]);
      setUser(me);
      setFullName(me?.full_name || "");
      setDevices(devs);
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await base44.auth.updateMe({ full_name: fullName });
    toast({ title: "Profile updated" });
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl tracking-tight">Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account settings</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="font-heading font-semibold text-sm flex items-center gap-2">
          <User className="w-4 h-4 text-primary" />
          Account Information
        </h3>

        <div className="space-y-2">
          <Label className="text-xs font-medium">Full Name</Label>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="h-10 bg-secondary border-border"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium">Email</Label>
          <div className="flex items-center gap-2 h-10 px-3 bg-secondary border border-border rounded-md">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{user?.email}</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium">Role</Label>
          <div className="flex items-center gap-2 h-10 px-3 bg-secondary border border-border rounded-md">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground capitalize">{user?.role || "user"}</span>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full h-10 text-sm font-semibold">
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>


    </div>
  );
}