import React from "react";
import { AlertTriangle, CheckCircle, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function IssueDetectionPanel({ issues, summary, onSummarize, isSummarizing, resolved, onResolve }) {
  return (
    <div className="p-4 space-y-4">
      {/* Detected Issues */}
      {issues && issues.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            Detected Issues
          </p>
          <div className="space-y-1.5">
            {issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-2 bg-amber-400/5 border border-amber-400/20 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">{issue}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {summary ? (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <FileText className="w-3 h-3 text-primary" />
            Session Summary
          </p>
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <p className="text-xs text-foreground/80 leading-relaxed">{summary}</p>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 h-9 text-xs touch-manipulation"
          onClick={onSummarize}
          disabled={isSummarizing}
        >
          {isSummarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          {isSummarizing ? "Generating Summary..." : "Generate Summary"}
        </Button>
      )}

      {/* Resolve */}
      {!resolved && (
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 h-9 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 touch-manipulation"
          onClick={onResolve}
        >
          <CheckCircle className="w-3.5 h-3.5" />
          Mark as Resolved
        </Button>
      )}
      {resolved && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-emerald-400">
          <CheckCircle className="w-3.5 h-3.5" />
          Resolved
        </div>
      )}
    </div>
  );
}