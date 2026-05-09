import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, AlertTriangle, MessageSquare } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  semanticService, extractError,
  type SemanticQuestion,
} from "@/lib/api";

type Phase = "loading" | "questions" | "generating" | "done" | "error";

interface Props {
  connectionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Local-storage key for in-progress answers — survives forced re-login.
const draftKey = (id: string) => `waggle.onboarding.${id}`;

function loadDraft(id: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(draftKey(id));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDraft(id: string, answers: Record<string, string>) {
  try {
    window.localStorage.setItem(draftKey(id), JSON.stringify(answers));
  } catch { /* quota — ignore */ }
}

function clearDraft(id: string) {
  try { window.localStorage.removeItem(draftKey(id)); } catch { /* */ }
}

export function SourceOnboardingDialog({ connectionId, open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<SemanticQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [cubes, setCubes] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Reset + kick off questions request whenever a new connection is handed in.
  useEffect(() => {
    if (!open || !connectionId) return;
    let cancelled = false;
    setPhase("loading");
    setAnswers(loadDraft(connectionId)); // restore any previously typed answers
    setCubes([]);
    setErrorMsg("");

    semanticService
      .generate(connectionId)
      .then((res) => {
        if (cancelled) return;
        if (res.status === "needs_input") {
          setQuestions(res.questions ?? []);
          setPhase(res.questions?.length ? "questions" : "done");
        } else if (res.status === "ok") {
          setCubes(res.cubes);
          setPhase("done");
        } else {
          setErrorMsg(res.detail);
          setPhase("error");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(extractError(err));
        setPhase("error");
      });

    return () => { cancelled = true; };
  }, [connectionId, open]);

  async function submit(rules: Record<string, string>) {
    if (!connectionId) return;
    setPhase("generating");
    try {
      const res = await semanticService.generate(connectionId, rules);
      if (res.status === "ok") {
        clearDraft(connectionId);
        setCubes(res.cubes);
        setPhase("done");
      } else if (res.status === "error") {
        setErrorMsg(res.detail);
        setPhase("error");
      } else {
        // Shouldn't get questions back after submitting rules — treat as done.
        setPhase("done");
      }
    } catch (err) {
      setErrorMsg(extractError(err));
      setPhase("error");
    }
  }

  function handleSkipAll() {
    onOpenChange(false);
  }

  function handleStartChat() {
    if (connectionId) navigate(`/chat/${connectionId}`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Set up semantic model</DialogTitle>
          <DialogDescription>
            A few questions to teach Waggle the meaning behind your data — improves SQL accuracy.
          </DialogDescription>
        </DialogHeader>

        {phase === "loading" && (
          <Centered>
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Extracting schema and drafting questions…
            </p>
          </Centered>
        )}

        {phase === "questions" && (
          <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
            {questions.map((q) => (
              <div key={q.id} className="space-y-1.5">
                <Label htmlFor={q.id}>{q.question}</Label>
                {q.field_hint && (
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Hint: {q.field_hint}
                  </p>
                )}
                <textarea
                  id={q.id}
                  rows={2}
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => {
                    const next = { ...a, [q.id]: e.target.value };
                    if (connectionId) saveDraft(connectionId, next);
                    return next;
                  })}
                  className="w-full rounded-md border border-[var(--color-input)] bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
                  placeholder="Your answer…"
                />
              </div>
            ))}
          </div>
        )}

        {phase === "generating" && (
          <Centered>
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Generating semantic model…
            </p>
          </Centered>
        )}

        {phase === "done" && (
          <Centered>
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="text-sm text-[var(--color-foreground)]">
              {cubes.length > 0
                ? `Model ready — ${cubes.length} cube${cubes.length === 1 ? "" : "s"} generated.`
                : "Source ready to query."}
            </p>
            {cubes.length > 0 && (
              <p className="text-xs text-[var(--color-muted-foreground)] text-center">
                {cubes.join(" · ")}
              </p>
            )}
          </Centered>
        )}

        {phase === "error" && (
          <Centered>
            <AlertTriangle className="h-8 w-8 text-[var(--color-destructive)]" />
            <p className="text-sm text-[var(--color-foreground)]">Couldn't generate the model.</p>
            <p className="text-xs text-[var(--color-muted-foreground)] text-center">{errorMsg}</p>
          </Centered>
        )}

        <DialogFooter>
          {phase === "questions" && (
            <>
              <Button variant="ghost" onClick={() => submit({})}>
                Skip questions
              </Button>
              <Button onClick={() => submit(answers)} disabled={Object.keys(answers).length === 0}>
                Generate model
              </Button>
            </>
          )}
          {phase === "loading" && (
            <Button variant="ghost" onClick={handleSkipAll}>Skip for now</Button>
          )}
          {phase === "generating" && (
            <Button variant="ghost" disabled>Generating…</Button>
          )}
          {phase === "done" && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
              <Button onClick={handleStartChat}>
                <MessageSquare className="h-3.5 w-3.5" /> Start chatting
              </Button>
            </>
          )}
          {phase === "error" && (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8">{children}</div>
  );
}
