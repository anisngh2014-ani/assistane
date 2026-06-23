import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Palette, Globe, Mail, Package, ArrowRight, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function WorkspaceSetup() {
  const [user, setUser] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    domain: "",
    logo_url: "",
    primary_color: "#6366f1",
    secondary_color: "#4f46e5",
    support_email: "",
    max_devices: 100,
  });
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      try {
        const me = await base44.auth.me();
        // Only the original platform owner can access
        if (me?.created_by_id) {
          toast({ title: "Access denied", variant: "destructive" });
          setLoading(false);
          return;
        }
        setUser(me);
        const ws = await base44.entities.Workspace.filter({ owner_id: me.id });
        if (ws.length > 0) {
          setWorkspace(ws[0]);
          setFormData(ws[0]);
        }
      } catch (err) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? parseInt(value) : value,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (workspace) {
        // Update existing
        await base44.entities.Workspace.update(workspace.id, formData);
        toast({ title: "Workspace updated" });
      } else {
        // Create new
        const ws = await base44.entities.Workspace.create({
          owner_id: user.id,
          ...formData,
        });
        setWorkspace(ws);
        toast({ title: "Workspace created" });
      }
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-7 h-7 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (user?.created_by_id) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Access denied.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading font-bold text-2xl sm:text-3xl tracking-tight">Workspace Setup</h1>
        <p className="text-muted-foreground text-sm mt-1">Customize your white-label workspace</p>
      </div>

      {/* Form */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        
        {/* Workspace Name */}
        <div>
          <label className="text-sm font-medium">Workspace Name</label>
          <p className="text-xs text-muted-foreground mb-2">Your company or brand name</p>
          <Input
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., TechSupport Co."
            className="h-10"
          />
        </div>

        {/* Domain */}
        <div>
          <label className="text-sm font-medium flex items-center gap-2 mb-2">
            <Globe className="w-4 h-4" />
            Custom Domain
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            e.g., support.yourcompany.com (requires DNS configuration)
          </p>
          <Input
            name="domain"
            value={formData.domain}
            onChange={handleChange}
            placeholder="support.company.com"
            className="h-10"
          />
        </div>

        {/* Logo URL */}
        <div>
          <label className="text-sm font-medium">Logo URL</label>
          <p className="text-xs text-muted-foreground mb-2">Full URL to your company logo</p>
          <Input
            name="logo_url"
            value={formData.logo_url}
            onChange={handleChange}
            placeholder="https://company.com/logo.png"
            className="h-10"
          />
          {formData.logo_url && (
            <div className="mt-2 p-3 bg-secondary rounded-lg">
              <img
                src={formData.logo_url}
                alt="Logo preview"
                className="h-12 object-contain"
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
            </div>
          )}
        </div>

        {/* Colors */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium flex items-center gap-2 mb-2">
              <Palette className="w-4 h-4" />
              Primary Color
            </label>
            <div className="flex gap-2">
              <Input
                type="color"
                name="primary_color"
                value={formData.primary_color}
                onChange={handleChange}
                className="h-10 w-16 p-1"
              />
              <Input
                name="primary_color"
                value={formData.primary_color}
                onChange={handleChange}
                placeholder="#6366f1"
                className="h-10 flex-1 font-mono text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium flex items-center gap-2 mb-2">
              <Palette className="w-4 h-4" />
              Secondary Color
            </label>
            <div className="flex gap-2">
              <Input
                type="color"
                name="secondary_color"
                value={formData.secondary_color}
                onChange={handleChange}
                className="h-10 w-16 p-1"
              />
              <Input
                name="secondary_color"
                value={formData.secondary_color}
                onChange={handleChange}
                placeholder="#4f46e5"
                className="h-10 flex-1 font-mono text-xs"
              />
            </div>
          </div>
        </div>

        {/* Support Email */}
        <div>
          <label className="text-sm font-medium flex items-center gap-2 mb-2">
            <Mail className="w-4 h-4" />
            Support Email
          </label>
          <Input
            type="email"
            name="support_email"
            value={formData.support_email}
            onChange={handleChange}
            placeholder="support@company.com"
            className="h-10"
          />
        </div>

        {/* Max Devices */}
        <div>
          <label className="text-sm font-medium flex items-center gap-2 mb-2">
            <Package className="w-4 h-4" />
            Max Devices Limit
          </label>
          <p className="text-xs text-muted-foreground mb-2">Maximum devices allowed in this workspace</p>
          <Input
            type="number"
            name="max_devices"
            value={formData.max_devices}
            onChange={handleChange}
            min="1"
            className="h-10"
          />
        </div>
      </div>

      {/* Save Button */}
      <Button
        className="w-full h-11 text-sm gap-2"
        disabled={saving || !formData.name}
        onClick={handleSave}
      >
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <ArrowRight className="w-4 h-4" />
            Save Workspace Settings
          </>
        )}
      </Button>

      {/* Info */}
      {workspace && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-primary">Workspace Configured</p>
          <p className="text-xs text-muted-foreground">
            Your white-label workspace is ready. Share your custom domain with resellers and they'll see your branding on login.
          </p>
          {formData.domain && (
            <p className="text-xs font-mono bg-background/50 p-2 rounded">
              {formData.domain}
            </p>
          )}
        </div>
      )}
    </div>
  );
}