import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Check, Crown, Zap, Building2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { PLANS } from "@/lib/plans";
import { usePlan } from "@/hooks/usePlan";

const PLAN_ICONS = {
  free: Zap,
  pro: Crown,
  business: Building2,
};

export default function Upgrade() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { plan: currentPlan, loading } = usePlan();
  const [upgrading, setUpgrading] = useState(null);

  const handleSelect = async (planKey) => {
    if (planKey === currentPlan?.key) return;
    setUpgrading(planKey);
    // Persist plan choice to user profile
    await base44.auth.updateMe({ subscription_plan: planKey });
    toast({
      title: `Upgraded to ${PLANS[planKey].label}`,
      description: "Your plan has been updated.",
    });
    setUpgrading(null);
    navigate("/");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground h-8 text-xs" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Button>
      </div>

      <div className="text-center space-y-2">
        <h1 className="font-heading font-bold text-3xl tracking-tight">Choose your plan</h1>
        <p className="text-muted-foreground text-sm">Scale your remote access needs with the right plan</p>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {Object.values(PLANS).map((plan) => {
          const Icon = PLAN_ICONS[plan.key];
          const isCurrent = currentPlan?.key === plan.key;
          const isUpgrading = upgrading === plan.key;

          return (
            <div
              key={plan.key}
              className={`relative bg-card border rounded-2xl p-6 flex flex-col transition-all duration-200 ${plan.border} ${
                isCurrent ? "ring-2 ring-primary/40" : "hover:border-primary/20"
              }`}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                    Current Plan
                  </span>
                </div>
              )}

              {plan.key === "pro" && !isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                    Most Popular
                  </span>
                </div>
              )}

              <div className={`w-11 h-11 rounded-xl ${plan.bg} border ${plan.border} flex items-center justify-center mb-4`}>
                <Icon className={`w-5 h-5 ${plan.color}`} />
              </div>

              <div className="mb-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${plan.badge}`}>{plan.label}</span>
              </div>

              <div className="mt-3 mb-5">
                <span className={`font-heading font-bold text-3xl ${plan.color}`}>{plan.price}</span>
                <span className="text-muted-foreground text-sm ml-1">{plan.period}</span>
              </div>

              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className={`w-4 h-4 mt-0.5 shrink-0 ${plan.color}`} />
                    <span className="text-foreground/80">{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                className="w-full"
                variant={isCurrent ? "secondary" : "default"}
                disabled={isCurrent || isUpgrading}
                onClick={() => handleSelect(plan.key)}
              >
                {isUpgrading ? "Upgrading..." : isCurrent ? "Current Plan" : `Get ${plan.label}`}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}