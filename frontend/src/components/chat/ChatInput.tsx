import { useState, useRef, KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onSend: (text: string) => void | Promise<void>;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function autosize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  async function submit() {
    const v = text.trim();
    if (!v || disabled) return;
    setText("");
    if (ref.current) ref.current.style.height = "auto";
    await onSend(v);
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-card)] p-3">
      <div className="flex gap-2 items-end rounded-xl border border-[var(--color-input)] bg-[var(--color-background)] p-2 focus-within:ring-2 focus-within:ring-[var(--color-ring)] transition">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          disabled={disabled}
          placeholder="Ask a question…"
          onChange={(e) => { setText(e.target.value); autosize(); }}
          onKeyDown={handleKey}
          className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm placeholder:text-[var(--color-muted-foreground)] focus:outline-none disabled:opacity-60"
        />
        <Button
          size="icon"
          onClick={submit}
          disabled={disabled || !text.trim()}
          className="h-9 w-9 shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-[10px] text-[var(--color-muted-foreground)] mt-1.5 px-1">
        Enter to send · Shift+Enter for newline
      </p>
    </div>
  );
}
