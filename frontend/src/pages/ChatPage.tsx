import { useMemo, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { ArrowLeft, Database, FileText } from "lucide-react";
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

  const focusedMessage = useMemo(() => {
    if (selectedMessageId) {
      return chat.messages.find((m) => m.id === selectedMessageId) ?? null;
    }
    // Default to the most recent assistant message that has a query result
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

  return (
    <div className="flex h-full">
      {/* Left: conversation */}
      <section className="flex flex-col w-[420px] xl:w-[480px] shrink-0 border-r border-[var(--color-border)] bg-[var(--color-card)]">
        <header className="h-12 px-3 flex items-center gap-2 border-b border-[var(--color-border)]">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigate("/dashboard")}
          >
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
        </header>

        <MessageList
          messages={chat.messages}
          selectedMessageId={selectedMessageId ?? focusedMessage?.id}
          onSelectMessage={setSelectedMessageId}
        />

        <ChatInput onSend={chat.send} disabled={chat.sending || !source} />
      </section>

      {/* Right: artifact panel */}
      <section className="flex-1 min-w-0">
        <CurrentArtifactPanel
          result={focusedResult}
          question={focusedQuestion}
          connectionId={connectionId}
        />
      </section>
    </div>
  );
}
