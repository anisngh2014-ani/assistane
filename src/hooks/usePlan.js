import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getPlan } from "@/lib/plans";

export function usePlan() {
  const [plan, setPlan] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me().then((me) => {
      setUser(me);
      setPlan(getPlan(me?.subscription_plan));
      setLoading(false);
    });
  }, []);

  return { plan, user, loading };
}