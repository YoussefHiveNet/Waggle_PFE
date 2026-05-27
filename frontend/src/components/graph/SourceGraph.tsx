import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
} from "@xyflow/react";
import { SourceNode, type SourceNodeData } from "./SourceNode";
import { LinkModal, type PendingConnection } from "./LinkModal";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import type { Source, SourceLink, SchemaResponse, JoinType } from "@/types";

// Module-scope nodeTypes — reference must be stable to avoid infinite re-renders
const nodeTypes = { sourceNode: SourceNode };

interface Props {
  sources: Source[];
  schemas: Record<string, SchemaResponse>;
  savedLinks: SourceLink[];
  onCreateLink: (
    sourceAId: string, tableA: string, colA: string,
    sourceBId: string, tableB: string, colB: string,
    joinType: JoinType,
  ) => Promise<void>;
  onDeleteLink: (id: string) => void;
}

export function SourceGraph({ sources, schemas, savedLinks, onCreateLink, onDeleteLink }: Props) {
  const [pending, setPending] = useState<PendingConnection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // ── Nodes: one per source ────────────────────────────────────────────────────
  const initialNodes: Node<SourceNodeData>[] = useMemo(
    () =>
      sources.map((src, i) => ({
        id: src.connection_id,
        type: "sourceNode",
        position: { x: i * 380, y: 80 },
        data: {
          label: src.label,
          source_type: src.source_type,
          tables: schemas[src.connection_id]?.schema ?? {},
        },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sources, schemas]
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);

  // ── Saved edges (solid, deleteable) ─────────────────────────────────────────
  const savedEdges: Edge[] = useMemo(
    () =>
      savedLinks.map((link) => ({
        id: link.id,
        source: link.source_a_id,
        sourceHandle: `${link.table_a}__left`,
        target: link.source_b_id,
        targetHandle: `${link.table_b}__right`,
        // label visible only when edge is selected (ReactFlow sets selected=true on click)
        label: `${link.col_a} → ${link.col_b} (${link.join_type})`,
        labelStyle: { fontSize: 10, fill: "var(--color-foreground)", opacity: 0 },
        labelBgStyle: { fill: "var(--color-card)", fillOpacity: 0 },
        style: { stroke: "var(--color-primary)", strokeWidth: 2 },
        data: { linkId: link.id, label: `${link.col_a} → ${link.col_b} (${link.join_type})` },
      })),
    [savedLinks]
  );

  // ── Suggested edges (dashed, read-only) ─────────────────────────────────────
  const suggestedEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    const savedKeys = new Set(
      savedLinks.map((l) => `${l.source_a_id}::${l.table_a}→${l.source_b_id}::${l.table_b}`)
    );

    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const srcA = sources[i];
        const srcB = sources[j];
        const schemaA = schemas[srcA.connection_id]?.schema ?? {};
        const schemaB = schemas[srcB.connection_id]?.schema ?? {};

        for (const [tableNameA, tableDataA] of Object.entries(schemaA)) {
          for (const colA of tableDataA.columns) {
            const suggestions: Array<{ tableB: string; hint: string }> = [];

            // Strategy 1: FK reference points to a table that exists in source B
            if (colA.foreign_key && schemaB[colA.foreign_key.foreign_table]) {
              suggestions.push({
                tableB: colA.foreign_key.foreign_table,
                hint: `${colA.name} → ${colA.foreign_key.foreign_column}`,
              });
            }

            // Strategy 2: column ends in _id and a matching table exists in source B
            if (colA.name.endsWith("_id")) {
              const guessed = colA.name.slice(0, -3);
              if (schemaB[guessed] && !suggestions.find((s) => s.tableB === guessed)) {
                suggestions.push({ tableB: guessed, hint: colA.name });
              }
            }

            for (const { tableB, hint } of suggestions) {
              const key = `${srcA.connection_id}::${tableNameA}→${srcB.connection_id}::${tableB}`;
              if (!savedKeys.has(key) && !edges.find((e) => e.id === `suggested::${key}`)) {
                edges.push({
                  id: `suggested::${key}`,
                  source: srcA.connection_id,
                  sourceHandle: `${tableNameA}__left`,
                  target: srcB.connection_id,
                  targetHandle: `${tableB}__right`,
                  label: `suggested · ${hint}`,
                  labelStyle: { fontSize: 9, fill: "#94a3b8" },
                  labelBgStyle: { fill: "var(--color-card)", fillOpacity: 0.7 },
                  style: { strokeDasharray: "5,5", stroke: "#94a3b8", strokeWidth: 1.5 },
                  animated: false,
                  data: {},
                });
              }
            }
          }
        }
      }
    }
    return edges;
  }, [sources, schemas, savedLinks]);

  // ── Connect handler — opens modal, does NOT add a temporary edge ─────────────
  const onConnect = useCallback(
    (connection: Connection) => {
      const { source, sourceHandle, target, targetHandle } = connection;
      if (!source || !sourceHandle || !target || !targetHandle) return;
      if (source === target) return; // no self-links

      const tableA = sourceHandle.replace("__left", "");
      const tableB = targetHandle.replace("__right", "");

      const schemaA = schemas[source]?.schema ?? {};
      const schemaB = schemas[target]?.schema ?? {};
      const srcA = sources.find((s) => s.connection_id === source);
      const srcB = sources.find((s) => s.connection_id === target);

      if (!srcA || !srcB || !schemaA[tableA] || !schemaB[tableB]) return;

      setPending({
        sourceId: source,
        sourceLabel: srcA.label,
        tableA,
        columnsA: schemaA[tableA].columns,
        targetId: target,
        targetLabel: srcB.label,
        tableB,
        columnsB: schemaB[tableB].columns,
      });
    },
    [sources, schemas]
  );

  // ── Modal confirm ────────────────────────────────────────────────────────────
  async function handleConfirm(colA: string, colB: string, joinType: JoinType) {
    if (!pending) return;
    await onCreateLink(
      pending.sourceId, pending.tableA, colA,
      pending.targetId, pending.tableB, colB,
      joinType,
    );
    setPending(null);
  }

  // ── Edge right-click → confirm dialog ────────────────────────────────────────
  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      const linkId = edge.data?.linkId;
      if (typeof linkId === "string") setDeleteTarget(linkId);
    },
    []
  );

  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Apply label visibility based on selection state
  const allEdges: Edge[] = useMemo(() => [
    ...savedEdges.map((e) =>
      e.id === selectedEdgeId
        ? {
            ...e,
            labelStyle: { fontSize: 10, fill: "var(--color-foreground)", opacity: 1 },
            labelBgStyle: { fill: "var(--color-card)", fillOpacity: 0.9 },
          }
        : e
    ),
    ...suggestedEdges,
  ], [savedEdges, suggestedEdges, selectedEdgeId]);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId((prev) => (prev === edge.id ? null : edge.id));
  }, []);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={allEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        onEdgeContextMenu={onEdgeContextMenu}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-border)" />
        <Controls />
        <MiniMap
          nodeColor="var(--color-muted)"
          maskColor="rgba(0,0,0,0.04)"
          style={{ border: "1px solid var(--color-border)" }}
        />
      </ReactFlow>

      {/* key resets local state (col selections) for each new connection attempt */}
      <LinkModal
        key={pending ? `${pending.sourceId}::${pending.tableA}→${pending.targetId}::${pending.tableB}` : "closed"}
        pending={pending}
        onConfirm={handleConfirm}
        onCancel={() => setPending(null)}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this link?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && savedLinks.find((l) => l.id === deleteTarget)
                ? (() => {
                    const l = savedLinks.find((l) => l.id === deleteTarget)!;
                    return `${l.table_a}.${l.col_a} → ${l.table_b}.${l.col_b} (${l.join_type})`;
                  })()
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) onDeleteLink(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
