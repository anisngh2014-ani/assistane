export const PLANS = {
  free: {
    key: "free",
    label: "Free",
    price: "$0",
    period: "forever",
    color: "text-muted-foreground",
    bg: "bg-muted/50",
    border: "border-border",
    badge: "bg-muted text-muted-foreground",
    maxDevices: 1,
    maxSessions: 1,
    teamManagement: false,
    features: [
      "1 device",
      "1 concurrent session",
      "Basic remote access",
    ],
  },
  pro: {
    key: "pro",
    label: "Pro",
    price: "$12",
    period: "per month",
    color: "text-primary",
    bg: "bg-primary/5",
    border: "border-primary/30",
    badge: "bg-primary/10 text-primary",
    maxDevices: 10,
    maxSessions: Infinity,
    teamManagement: false,
    features: [
      "10 devices",
      "Unlimited sessions",
      "Priority support",
      "Session history",
    ],
  },
  business: {
    key: "business",
    label: "Business",
    price: "$39",
    period: "per month",
    color: "text-amber-400",
    bg: "bg-amber-400/5",
    border: "border-amber-400/30",
    badge: "bg-amber-400/10 text-amber-400",
    maxDevices: Infinity,
    maxSessions: Infinity,
    teamManagement: true,
    features: [
      "Unlimited devices",
      "Unlimited sessions",
      "Team management",
      "Advanced analytics",
      "Dedicated support",
    ],
  },
};

export function getPlan(key) {
  return PLANS[key] || PLANS.free;
}