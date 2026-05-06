import { useEffect, useRef } from "react";
import { Bot, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/hooks/useChat";

interface Props {
  messages: ChatMessage[];
  selectedMessageId?: string | null;
  onSelectMessage?: (id: string) => void;
}

export function MessageList({ messages, selectedMessageId, onSelectMessage }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <Bot className="h-10 w-10 text-[var(--color-muted-foreground)] mb-3" />
        <p className="text-sm text-[var(--color-foreground)] font-medium">Ask me a question</p>
        <p className="text-xs text-[var(--color-muted-foreground)] mt-1 max-w-sm">
          Try "How many users do we have?" or "Show me revenue by month"
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-4 py-4 space-y-4 [scrollbar-width:thin]">
      {messages.map((m) => (
        <Bubble
          key={m.id}
          message={m}
          selected={m.id === selectedMessageId}
          onSelect={onSelectMessage ? () => onSelectMessage(m.id) : undefined}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function Bubble({
  message, selected, onSelect,
}: {
  message: ChatMessage;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const isUser = message.role === "user";
  const isPending = message.pending;
  const isAssistantWithResult = !isUser && message.toolCall?.tool === "query";

  return (
    <div className={cn("flex gap-3 items-start", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "h-7 w-7 shrink-0 rounded-full flex items-center justify-center mt-0.5",
          isUser ? "bg-[var(--color-primary)]" : "bg-[var(--color-muted)]"
        )}
      >
        {isUser ? (
          <UserIcon className="h-3.5 w-3.5 text-[var(--color-primary-foreground)]" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-[var(--color-foreground)]" />
        )}
      </div>

      <button
        type="button"
        disabled={!isAssistantWithResult || !onSelect}
        onClick={onSelect}
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed text-left transition-all",
          isUser
            ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] rounded-tr-md"
            : "bg-[var(--color-muted)] text-[var(--color-foreground)] rounded-tl-md",
          isAssistantWithResult && "cursor-pointer hover:ring-2 hover:ring-[var(--color-primary)]/30",
          selected && "ring-2 ring-[var(--color-primary)]"
        )}
      >
        {isPending ? <Typing /> : message.content}
      </button>
    </div>
  );
}

function Typing() {
  return (
    <span className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-[var(--color-muted-foreground)] animate-bounce"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}
