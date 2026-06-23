import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Send, MessageCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function ChatBox({ device, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const { toast } = useToast();

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [device.id]);

  const loadMessages = async () => {
    try {
      const response = await base44.functions.invoke("deviceApi", {
        method: "GET",
        endpoint: `messages?device_id=${device.id}`,
      });
      if (response.data.success) {
        setMessages(response.data.messages);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    setLoading(true);
    const messageText = input.trim();
    setInput("");

    try {
      const response = await base44.functions.invoke("deviceApi", {
        method: "POST",
        endpoint: "send-message",
        device_id: device.id,
        content: messageText,
      });

      if (response.data.success) {
        setMessages((prev) => [...prev, response.data.message]);
        scrollToBottom();
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
      setInput(messageText); // restore input
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  if (!isOpen) {
    return (
      <Button
        size="sm"
        className="fixed bottom-4 right-4 gap-2 rounded-full h-12 w-12 p-0 shadow-lg"
        onClick={() => setIsOpen(true)}
      >
        <MessageCircle className="w-5 h-5" />
      </Button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 h-96 bg-card border border-border rounded-lg shadow-lg flex flex-col overflow-hidden">
      <div className="bg-primary text-primary-foreground p-3 flex justify-between items-center">
        <h3 className="text-sm font-semibold">Chat</h3>
        <button
          className="text-sm text-primary-foreground/60 hover:text-primary-foreground"
          onClick={() => setIsOpen(false)}
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">No messages yet</p>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${
                msg.sender_type === "admin" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-xs px-3 py-2 rounded-lg text-xs ${
                  msg.sender_type === "admin"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                <p className="font-semibold text-[10px] mb-1 opacity-70">
                  {msg.sender_type === "admin" ? "You" : "User"}
                </p>
                {msg.content}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-border p-3 flex gap-2">
        <input
          type="text"
          placeholder="Type a message..."
          className="flex-1 h-8 px-2 rounded text-xs bg-input border border-border outline-none focus:ring-1 focus:ring-primary"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && sendMessage()}
          disabled={loading}
        />
        <Button
          size="sm"
          className="h-8 w-8 p-0"
          disabled={loading || !input.trim()}
          onClick={sendMessage}
        >
          {loading ? (
            <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="w-3 h-3" />
          )}
        </Button>
      </div>
    </div>
  );
}