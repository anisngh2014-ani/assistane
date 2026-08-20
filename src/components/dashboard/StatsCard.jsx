import React from "react";

export default function StatsCard({ icon: Icon, label, value, accent, onClick }) {
  return (
    <div 
      onClick={onClick}
      className={`bg-card border border-border rounded-xl p-5 transition-all ${onClick ? "cursor-pointer hover:border-primary/50 hover:bg-card/80" : ""}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent || "bg-primary/10"}`}>
          <Icon className={`w-4.5 h-4.5 ${accent ? "text-current" : "text-primary"}`} />
        </div>
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="font-heading font-bold text-2xl">{value}</p>
    </div>
  );
}