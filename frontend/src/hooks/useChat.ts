import { useCallback, useState } from "react";
import { extractError, queryService, sessionService } from "@/lib/api";
import type { QueryToolResult, Row, SchemaToolResult, ToolCall } from "@/types";
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

  const loadSession = useCallback(async (sessionId: string) => {
    try {
      const data = await sessionService.get(sessionId);
      const msgs = data.messages as Array<{
        role: string;
        content: string;
        tool_name?: string;
        result?: unknown;
      }>;

      const chatMessages: ChatMessage[] = [];
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        if (m.role === "user") {
          chatMessages.push({
            id: crypto.randomUUID(),
            role: "user",
            content: m.content,
          });
        } else if (
          m.role === "assistant" &&
          !m.content.startsWith("[Calling tool") &&
          !m.content.startsWith("[Tool result]")
        ) {
          // Find nearest preceding tool result within the same turn
          let toolCall: ToolCall | undefined;
          for (let j = i - 1; j >= 0; j--) {
            if (msgs[j].role === "tool") {
              toolCall = {
                tool: (msgs[j].tool_name ?? "query") as "query" | "get_schema",
                params: {},
                result: msgs[j].result as QueryToolResult,
              };
              break;
            }
            if (msgs[j].role === "user") break;
          }
          chatMessages.push({
            id: crypto.randomUUID(),
            role: "assistant",
            content: m.content,
            toolCall,
          });
        }
      }

      setState({ messages: chatMessages, sessionId, sending: false });
    } catch (err) {
      toast({ variant: "destructive", description: extractError(err) });
    }
  }, []);

  return { ...state, send, reset, loadSession };
}

/** Pull the underlying query result out of a tool call, if it has one.
 *
 * Also adapts get_schema results into a synthetic QueryToolResult so the
 * artifact panel can render "list all tables" as a one-column table without
 * any panel- or renderer-side changes.
 */
export function getQueryResult(toolCall?: ToolCall): QueryToolResult | null {
  if (!toolCall) return null;

  // Schema tool — adapt {tables: ["a","b",...]} into {data: [{table_name:"a"}, ...]}
  if (toolCall.tool === "get_schema") {
    const r = toolCall.result;
    if ("error" in r && r.error) return null;
    const schema = r as SchemaToolResult;
    const rows: Row[] = (schema.tables ?? []).map((name) => ({ table_name: name }));
    if (rows.length === 0) return null;
    return {
      sql: "",
      data: rows,
      row_count: rows.length,
      validation_report: { passed: true, checks: [], failures: [], confidence: 1 },
      confidence: 1,
      attempts: 1,
    };
  }

  // Query tool — original behavior
  if (toolCall.tool !== "query") return null;
  const r = toolCall.result as QueryToolResult;
  if ("error" in r && r.error) return null;
  return r;
}
