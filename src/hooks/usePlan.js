import { useState, useEffect } from "react";
import { assistane } from "@/api/assistaneClient";
import { getPlan } from "@/lib/plans";

export function usePlan() {
  const [plan, setPlan] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    assistane.auth.me().then((me) => {
      setUser(me);
      setPlan(getPlan(me?.subscription_plan));
      setLoading(false);
    });
  }, []);

  return { plan, user, loading };
}