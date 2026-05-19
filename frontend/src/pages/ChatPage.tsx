import { useMemo, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { ArrowLeft, Database, FileText, BarChart2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSource } from "@/hooks/useSources";
import { useChat, getQueryResult } from "@/hooks/useChat";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { CurrentArtifactPanel } from "@/components/chat/CurrentArtifactPanel";

export function ChatPage() {
  const { connectionId } = useParams<{ connectionId: string }>();
  const navigate = useNavigate();
  const { data: source, isLoading, isError } = useSource(connectionId);
  const chat = useChat(connectionId ?? "");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"chat" | "artifact">("chat");

  const focusedMessage = useMemo(() => {
    if (selectedMessageId) {
      return chat.messages.find((m) => m.id === selectedMessageId) ?? null;
    }
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const m = chat.messages[i];
      if (m.role === "assistant" && getQueryResult(m.toolCall)) return m;
    }
    return null;
  }, [chat.messages, selectedMessageId]);

  const focusedResult = focusedMessage ? getQueryResult(focusedMessage.toolCall) : null;
  const focusedQuestion = useMemo(() => {
    if (!focusedMessage) return "";
    const idx = chat.messages.findIndex((m) => m.id === focusedMessage.id);
    for (let i = idx - 1; i >= 0; i--) {
      if (chat.messages[i].role === "user") return chat.messages[i].content;
    }
    return "";
  }, [focusedMessage, chat.messages]);

  if (!connectionId) return <Navigate to="/dashboard" replace />;

  const lastAssistant = chat.messages.length > 0
    ? [...chat.messages].reverse().find((m) => m.role === "assistant" && !m.pending)
    : null;
  const lastAssistantHasNoQuery = lastAssistant !== null && !getQueryResult(lastAssistant?.toolCall);

  const sourceHeader = (
    <header className="h-12 px-3 flex items-center gap-2 border-b border-[var(--color-border)] shrink-0">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/dashboard")}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-0 flex-1">
        {isLoading ? (
          <div className="text-sm text-[var(--color-muted-foreground)]">Loading…</div>
        ) : isError || !source ? (
          <div className="text-sm text-[var(--color-destructive)]">Source not found</div>
        ) : (
          <div className="flex items-center gap-2">
            {source.source_type === "postgres" ? (
              <Database className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
            ) : (
              <FileText className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
            )}
            <span className="text-sm font-medium truncate">{source.label}</span>
          </div>
        )}
      </div>

      {/* Mobile tab toggle */}
      <div className="md:hidden flex rounded-lg bg-[var(--color-muted)] p-0.5 gap-0.5">
        <button
          onClick={() => setMobileTab("chat")}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
            mobileTab === "chat"
              ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
              : "text-[var(--color-muted-foreground)]"
          }`}
        >
          <MessageSquare className="h-3 w-3" /> Chat
        </button>
        <button
          onClick={() => setMobileTab("artifact")}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
            mobileTab === "artifact"
              ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
              : "text-[var(--color-muted-foreground)]"
          }`}
        >
          <BarChart2 className="h-3 w-3" /> Result
        </button>
      </div>
    </header>
  );

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] md:h-full min-h-0 overflow-hidden">
      {/* Left: conversation — full width on mobile, fixed on desktop */}
      <section
        className={`flex flex-col w-full md:w-[420px] xl:w-[480px] md:shrink-0 min-h-0 border-r border-[var(--color-border)] bg-[var(--color-card)] ${
          mobileTab === "artifact" ? "hidden md:flex" : "flex"
        }`}
      >
        {sourceHeader}
        <MessageList
          messages={chat.messages}
          selectedMessageId={selectedMessageId ?? focusedMessage?.id}
          onSelectMessage={(id) => {
            setSelectedMessageId(id);
            setMobileTab("artifact");
          }}
        />
        <ChatInput onSend={chat.send} disabled={chat.sending || !source} />
      </section>

      {/* Right: artifact panel */}
      <section
        className={`flex-1 min-w-0 min-h-0 ${
          mobileTab === "chat" ? "hidden md:flex md:flex-col" : "flex flex-col"
        }`}
      >
        <div className="md:hidden">{sourceHeader}</div>
        <CurrentArtifactPanel
          result={focusedResult}
          question={focusedQuestion}
          connectionId={connectionId}
          hasAnswerWithoutQuery={lastAssistantHasNoQuery && !focusedResult}
        />
      </section>
    </div>
  );
}
