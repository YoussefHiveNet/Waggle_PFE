import { useCallback, useState } from "react";
import { extractError, queryService } from "@/lib/api";
import type { QueryToolResult, ToolCall } from "@/types";
import { toast } from "@/hooks/useToast";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCall?: ToolCall;     // present on assistant messages backed by a tool result
  pending?: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
  sending: boolean;
}

/**
 * Manages a single chat conversation against one source. The backend session
 * is created on first send. We store session_id locally; reload re-creates a
 * new session unless the caller passes one in.
 */
export function useChat(connectionId: string, initialSessionId?: string) {
  const [state, setState] = useState<ChatState>({
    messages: [],
    sessionId: initialSessionId ?? null,
    sending: false,
  });

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || state.sending) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
      };
      const placeholderId = crypto.randomUUID();

      setState((s) => ({
        ...s,
        sending: true,
        messages: [
          ...s.messages,
          userMsg,
          { id: placeholderId, role: "assistant", content: "", pending: true },
        ],
      }));

      try {
        const res = await queryService.run(connectionId, {
          question: trimmed,
          session_id: state.sessionId ?? undefined,
        });

        const toolCall = res.tool_calls[0];
        setState((s) => ({
          ...s,
          sessionId: res.session_id,
          sending: false,
          messages: s.messages.map((m) =>
            m.id === placeholderId
              ? {
                  id: m.id,
                  role: "assistant",
                  content: res.response,
                  toolCall,
                }
              : m
          ),
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          sending: false,
          messages: s.messages.map((m) =>
            m.id === placeholderId
              ? {
                  id: m.id,
                  role: "assistant",
                  content: `Sorry — ${extractError(err)}`,
                }
              : m
          ),
        }));
        toast({ variant: "destructive", description: extractError(err) });
      }
    },
    [connectionId, state.sessionId, state.sending]
  );

  const reset = useCallback(() => {
    setState({ messages: [], sessionId: null, sending: false });
  }, []);

  return { ...state, send, reset };
}

/** Pull the underlying query result out of a tool call, if it has one. */
export function getQueryResult(toolCall?: ToolCall): QueryToolResult | null {
  if (!toolCall || toolCall.tool !== "query") return null;
  const r = toolCall.result as QueryToolResult;
  if ("error" in r && r.error) return null;
  return r;
}
