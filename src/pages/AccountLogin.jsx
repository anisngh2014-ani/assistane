import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { LogIn } from "lucide-react";

export default function AccountLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "suspended") {
      setError("Your account access has been revoked. Contact your administrator to regain access.");
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await base44.functions.invoke("deviceApi", {
        endpoint: "account-login",
        username,
        password,
      });

      if (res.data.success) {
        // Store session token and account info in localStorage
        localStorage.setItem("accountToken", res.data.session_token);
        localStorage.setItem("accountId", res.data.account_id);
        localStorage.setItem("accountName", res.data.full_name);
        
        toast({ title: "Login successful", description: `Welcome, ${res.data.full_name}!` });
        navigate("/customer-dashboard");
      } else {
        setError("Login failed");
      }
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("not active") || msg.includes("suspended")) {
        setError("Your account access has been revoked. Contact your administrator to regain access.");
      } else {
        setError(msg || "Invalid username or password");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-card flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <div className="bg-primary/20 p-3 rounded-lg">
              <LogIn className="w-6 h-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Customer Login</h1>
          <p className="text-muted-foreground text-sm">Sign in to your account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/20 text-destructive text-sm border border-destructive/30">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Username</label>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={loading}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !username || !password}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              "Sign In"
            )}
          </Button>
        </form>

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground">
          <p>Contact support if you need help logging in.</p>
        </div>
      </div>
    </div>
  );
}
