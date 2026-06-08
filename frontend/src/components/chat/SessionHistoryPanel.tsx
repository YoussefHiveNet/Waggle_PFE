import { MessageSquarePlus, MessageSquare, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessions } from "@/hooks/useSessions";
import type { ChatSession } from "@/types";

function relativeTime(ts: number | null): string {
  if (!ts) return "";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

interface SessionHistoryPanelProps {
  connectionId: string;
  activeSessionId: string | null;
  onLoadSession: (sessionId: string) => void;
  onNewChat: () => void;
}

export function SessionHistoryPanel({
  connectionId,
  activeSessionId,
  onLoadSession,
  onNewChat,
}: SessionHistoryPanelProps) {
  const { data: sessions, isLoading } = useSessions(connectionId);

  const sorted = sessions
    ? [...sessions]
        .filter((s) => s.message_count > 0)
        .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
    : [];

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--color-background)]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border)] shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-xs"
          onClick={onNewChat}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          New chat
        </Button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="px-3 py-4 text-xs text-[var(--color-muted-foreground)] text-center">
            Loading…
          </div>
        ) : sorted.length === 0 ? (
          <div className="px-3 py-4 text-xs text-[var(--color-muted-foreground)] text-center">
            No previous chats
          </div>
        ) : (
          sorted.map((session) => (
            <SessionRow
              key={session.session_id}
              session={session}
              isActive={session.session_id === activeSessionId}
              onClick={() => onLoadSession(session.session_id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SessionRow({
  session,
  isActive,
  onClick,
}: {
  session: ChatSession;
  isActive: boolean;
  onClick: () => void;
}) {
  const title = session.first_message || "Empty conversation";
  const time = relativeTime(session.created_at);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-[var(--color-muted)] transition-colors rounded-sm mx-1 ${
        isActive ? "bg-[var(--color-muted)]" : ""
      }`}
      style={{ width: "calc(100% - 8px)" }}
    >
      <MessageSquare
        className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
          isActive
            ? "text-[var(--color-primary)]"
            : "text-[var(--color-muted-foreground)]"
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium truncate text-[var(--color-foreground)]">
          {title}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {time && (
            <span className="text-[10px] text-[var(--color-muted-foreground)] flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {time}
            </span>
          )}
          <span className="text-[10px] text-[var(--color-muted-foreground)]">
            · {Math.max(1, Math.floor(session.message_count / 4))} turn{Math.max(1, Math.floor(session.message_count / 4)) !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </button>
  );
}
