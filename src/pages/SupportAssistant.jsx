import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Bot, ChevronLeft, Menu, X, Loader2, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import SupportChatMessage from "@/components/support/SupportChatMessage";
import ConversationSidebar from "@/components/support/ConversationSidebar";
import IssueDetectionPanel from "@/components/support/IssueDetectionPanel";

const SYSTEM_PROMPT = `You are an expert AI support assistant for RemotePilot, a remote desktop access platform.
Your role is to:
1. Analyze computer and system issues reported by users
2. Provide clear, step-by-step troubleshooting guidance
3. Detect common system problems (connectivity, performance, crashes, driver issues, etc.)
4. Suggest fixes tailored to Windows, macOS, and Linux
5. Be concise, friendly, and technically accurate

When you detect specific issues, mention them clearly.
Format responses with markdown: use **bold** for important steps, bullet lists for options, and code blocks for commands.`;

const QUICK_PROMPTS = [
  "My device won't connect remotely",
  "Remote session keeps disconnecting",
  "Screen sharing is laggy or frozen",
  "Device shows offline but is running",
  "High CPU usage during remote session",
];

export default function SupportAssistant() {
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const { toast } = useToast();

  useEffect(() => {
    loadConversations();
    base44.entities.Device.list().then(setDevices);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const loadConversations = async () => {
    setLoadingConvs(true);
    const user = await base44.auth.me();
    const data = await base44.entities.SupportConversation.filter(
      { user_id: user.id },
      "-updated_date",
      50
    );
    setConversations(data);
    setLoadingConvs(false);
  };

  const handleSelectConv = (conv) => {
    setActiveConv(conv);
    setMessages(conv.messages || []);
    setSidebarOpen(false);
    setInfoPanelOpen(false);
  };

  const handleNewConversation = () => {
    setActiveConv(null);
    setMessages([]);
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg = { role: "user", content: text, timestamp: new Date().toISOString() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setSending(true);

    try {
      const user = await base44.auth.me();

      // Build context-aware prompt
      const history = newMessages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
      const deviceContext = selectedDevice
        ? `\n\nDevice context: ${selectedDevice.device_name} (${selectedDevice.operating_system}), Status: ${selectedDevice.online_status}`
        : "";

      const prompt = `${SYSTEM_PROMPT}${deviceContext}\n\nConversation so far:\n${history}\n\nRespond as the AI support assistant. Also, if you detect any specific issues, list them at the end under "DETECTED_ISSUES:" as a comma-separated list (or write "DETECTED_ISSUES: none").`;

      const result = await base44.integrations.Core.InvokeLLM({ prompt });

      // Parse detected issues from response
      let aiContent = result;
      let detectedIssues = activeConv?.detected_issues || [];
      const issuesMatch = result.match(/DETECTED_ISSUES:\s*(.+)/i);
      if (issuesMatch) {
        const raw = issuesMatch[1].trim();
        if (raw.toLowerCase() !== "none") {
          const newIssues = raw.split(",").map((s) => s.trim()).filter(Boolean);
          detectedIssues = [...new Set([...detectedIssues, ...newIssues])];
        }
        aiContent = result.replace(/DETECTED_ISSUES:.*$/im, "").trim();
      }

      const aiMsg = { role: "assistant", content: aiContent, timestamp: new Date().toISOString() };
      const finalMessages = [...newMessages, aiMsg];
      setMessages(finalMessages);

      // Auto-title from first user message
      const title = activeConv?.title || text.slice(0, 60) + (text.length > 60 ? "…" : "");

      if (activeConv) {
        const updated = await base44.entities.SupportConversation.update(activeConv.id, {
          messages: finalMessages,
          detected_issues: detectedIssues,
          title,
        });
        setActiveConv({ ...activeConv, ...updated, messages: finalMessages, detected_issues: detectedIssues });
      } else {
        const created = await base44.entities.SupportConversation.create({
          user_id: user.id,
          title,
          device_id: selectedDevice?.id || null,
          device_name: selectedDevice?.device_name || null,
          messages: finalMessages,
          detected_issues: detectedIssues,
          status: "open",
        });
        setActiveConv(created);
        setConversations((prev) => [created, ...prev]);
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to get AI response", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleSummarize = async () => {
    if (!activeConv || messages.length < 2) return;
    setIsSummarizing(true);
    try {
      const history = messages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
      const prompt = `Summarize this support conversation in 2-3 sentences. Highlight the main issue, what was tried, and the outcome:\n\n${history}`;
      const summary = await base44.integrations.Core.InvokeLLM({ prompt });
      const updated = await base44.entities.SupportConversation.update(activeConv.id, { summary });
      setActiveConv({ ...activeConv, ...updated, summary });
      setConversations((prev) => prev.map((c) => c.id === activeConv.id ? { ...c, summary } : c));
    } catch {
      toast({ title: "Error", description: "Failed to generate summary", variant: "destructive" });
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleResolve = async () => {
    if (!activeConv) return;
    const updated = await base44.entities.SupportConversation.update(activeConv.id, { status: "resolved" });
    setActiveConv({ ...activeConv, status: "resolved" });
    setConversations((prev) => prev.map((c) => c.id === activeConv.id ? { ...c, status: "resolved" } : c));
    toast({ title: "Conversation resolved" });
  };

  const handleQuickPrompt = (text) => {
    setInput(text);
    inputRef.current?.focus();
  };

  const showInfoPanel = activeConv && ((activeConv.detected_issues?.length > 0) || activeConv.summary || messages.length > 1);

  return (
    <div className="flex h-[calc(100svh-3.5rem)] lg:h-[calc(100vh-4rem)] -m-4 sm:-m-6 lg:-m-8 overflow-hidden">

      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Left sidebar */}
      <aside className={`fixed lg:relative top-0 left-0 h-full w-64 bg-card border-r border-border z-50 flex flex-col transition-transform duration-300 ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      }`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-violet-400" />
            <span className="font-heading font-semibold text-sm">AI Support</span>
          </div>
          <button className="lg:hidden p-1 text-muted-foreground touch-manipulation" onClick={() => setSidebarOpen(false)}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <ConversationSidebar
          conversations={conversations}
          activeId={activeConv?.id}
          onSelect={handleSelectConv}
          onNew={handleNewConversation}
          loading={loadingConvs}
        />
      </aside>

      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Chat top bar */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 bg-card border-b border-border shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              className="lg:hidden p-1.5 text-muted-foreground hover:text-foreground touch-manipulation shrink-0"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-violet-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{activeConv?.title || "New Conversation"}</p>
              <p className="text-[11px] text-muted-foreground hidden sm:block">AI-powered system support</p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Device selector */}
            {devices.length > 0 && (
              <select
                value={selectedDevice?.id || ""}
                onChange={(e) => setSelectedDevice(devices.find(d => d.id === e.target.value) || null)}
                className="hidden sm:block h-8 text-xs bg-secondary border border-border rounded-md px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring max-w-[140px] truncate"
              >
                <option value="">No device</option>
                {devices.map((d) => <option key={d.id} value={d.id}>{d.device_name}</option>)}
              </select>
            )}
            {showInfoPanel && (
              <button
                className="p-1.5 text-muted-foreground hover:text-foreground touch-manipulation"
                onClick={() => setInfoPanelOpen((v) => !v)}
                title="Issues & Summary"
              >
                <Cpu className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4 py-8">
              <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <Bot className="w-8 h-8 text-violet-400" />
              </div>
              <div>
                <h2 className="font-heading font-bold text-lg mb-1">AI Support Assistant</h2>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Describe your computer or remote access issue. I'll analyze it and provide step-by-step troubleshooting guidance.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-md">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleQuickPrompt(q)}
                    className="px-3 py-1.5 rounded-full bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all touch-manipulation"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <SupportChatMessage key={i} message={msg} />
          ))}

          {sending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-violet-400" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                <span className="text-xs text-muted-foreground">Analyzing issue...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="shrink-0 p-3 sm:p-4 bg-card border-t border-border">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Describe your issue… (Enter to send, Shift+Enter for new line)"
                rows={1}
                style={{ resize: "none" }}
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring min-h-[44px] max-h-32 overflow-y-auto"
                onInput={(e) => {
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px";
                }}
              />
            </div>
            <Button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              size="sm"
              className="h-11 w-11 p-0 shrink-0 touch-manipulation rounded-xl"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5 pl-1 hidden sm:block">
            Shift+Enter for new line · Powered by AI
          </p>
        </div>
      </div>

      {/* Right info panel — slides in on mobile as overlay, fixed on desktop */}
      {infoPanelOpen && showInfoPanel && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setInfoPanelOpen(false)} />
          <aside className="fixed lg:relative right-0 top-0 h-full w-72 bg-card border-l border-border z-50 overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold">Analysis</p>
              <button className="p-1 text-muted-foreground hover:text-foreground touch-manipulation" onClick={() => setInfoPanelOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <IssueDetectionPanel
              issues={activeConv?.detected_issues}
              summary={activeConv?.summary}
              onSummarize={handleSummarize}
              isSummarizing={isSummarizing}
              resolved={activeConv?.status === "resolved"}
              onResolve={handleResolve}
            />
          </aside>
        </>
      )}
    </div>
  );
}