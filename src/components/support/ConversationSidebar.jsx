import React from "react";
import { Plus, MessageSquare, CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import moment from "moment";

export default function ConversationSidebar({ conversations, activeId, onSelect, onNew, loading }) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border shrink-0">
        <Button onClick={onNew} size="sm" className="w-full gap-2 h-9 touch-manipulation">
          <Plus className="w-4 h-4" />
          New Conversation
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center h-24">
            <div className="w-5 h-5 border-2 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-8 px-3">
            <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No conversations yet</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all touch-manipulation ${
                activeId === conv.id
                  ? "bg-primary/10 border border-primary/20"
                  : "hover:bg-secondary border border-transparent"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className={`text-xs font-medium leading-tight truncate ${activeId === conv.id ? "text-primary" : "text-foreground"}`}>
                  {conv.title}
                </p>
                {conv.status === "resolved"
                  ? <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                  : <Clock className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />}
              </div>
              {conv.device_name && (
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">{conv.device_name}</p>
              )}
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {moment(conv.updated_date || conv.created_date).fromNow()}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}