import React from "react";

export default function AdminMetricCard({ label, value, icon: Icon, accent, loading, onClick }) {
  return (
    <div 
      onClick={onClick}
      className={`bg-card border border-border rounded-xl p-4 transition-all ${onClick ? "cursor-pointer hover:border-primary/50 hover:bg-card/80" : ""}`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${accent}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      {loading ? (
        <div className="h-7 w-12 bg-secondary rounded animate-pulse mb-1" />
      ) : (
        <p className="font-heading font-bold text-2xl">{value}</p>
      )}
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}