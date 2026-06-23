import React from "react";
import ReactMarkdown from "react-markdown";
import { Bot, User } from "lucide-react";
import moment from "moment";

export default function SupportChatMessage({ message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? "bg-primary/20 text-primary" : "bg-violet-500/20 text-violet-400"
      }`}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      <div className={`max-w-[80%] sm:max-w-[70%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-card border border-border rounded-tl-sm"
        }`}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>h3]:mb-1 [&>h3]:mt-2 [&>h3]:text-sm [&>h3]:font-semibold [&>ul]:pl-4 [&>ol]:pl-4 [&>li]:mb-0.5">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>
        {message.timestamp && (
          <span className="text-[11px] text-muted-foreground px-1">
            {moment(message.timestamp).format("h:mm A")}
          </span>
        )}
      </div>
    </div>
  );
}