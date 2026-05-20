# agent/tools/semantic_tool.py
from __future__ import annotations
from typing import Optional
import json
import re
from agent.llm import generate
from agent.tools.schema_tool import get_schema, format_for_llm, get_foreign_keys
from semantic.engine import SemanticEngine
from semantic.models import (
    SemanticModel, Cube, Dimension, Measure, Join,
    DimensionType, MeasureType
)

engine = SemanticEngine()

# ── PROMPTS ────────────────────────────────────────────────────────────────

CLASSIFY_PROMPT = """
You are building a semantic data model for business analytics.

Classify each column in the table below as one of:
- "dimension"  : categorical or descriptive (name, status, country, id, email)
- "measure"    : numeric and aggregatable (amount, count, score, duration)
- "time"       : date or timestamp (created_at, updated_at, order_date)
- "skip"       : internal/irrelevant (hashed passwords, raw UUIDs used only as FK)

Table: {table_name}
Columns: {columns}
Sample data: {samples}

Rules:
- Primary keys that are just surrogate IDs → "skip" unless needed for COUNT DISTINCT
- Foreign key columns → "skip" (the join handles the relationship)
- Any column ending in _at or _date → "time"
- Any column with values like amounts, prices, counts → "measure"

Respond ONLY as valid JSON, no explanation:
{{"column_name": "dimension|measure|time|skip"}}
"""

QUESTIONS_PROMPT = """
You are analyzing a database schema to build a semantic analytics model.

Schema summary:
{schema_summary}

Generate 3-5 clarification questions to understand the business logic.
Focus on:
- How key numeric metrics are calculated (e.g. what counts as revenue?)
- What status values matter (e.g. which order statuses mean success?)
- What "active" means for users or customers
- Any important date range conventions

Respond ONLY as valid JSON array:
[{{"id": "q1", "question": "...", "field_hint": "table.column"}}]
"""

ASSEMBLE_PROMPT = """
You are building a YAML semantic model for a data analytics platform.

Schema:
{schema_context}

Column classifications:
{classifications}

Foreign key relationships:
{fk_relationships}

Business rules from user:
{business_rules}

Generate a semantic model. For each table create a cube with:
- dimensions: non-numeric descriptive columns
- measures: numeric columns with correct aggregation (SUM, COUNT, AVG)
  - For measures, encode business rules in the SQL expression
    e.g. revenue = SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END)
- joins: from the FK relationships provided

Respond ONLY as valid JSON (no markdown fences, no comments, no trailing commas):
{{
  "cubes": [
    {{
      "name": "table_name",
      "sql_table": "table_name",
      "joins": [{{"name": "other_table", "sql": "a.fk = b.pk", "relationship": "many_to_one"}}],
      "dimensions": [{{"name": "col", "sql": "col", "type": "string", "description": ""}}],
      "measures": [{{"name": "col", "sql": "col_expr", "type": "sum", "description": ""}}]
    }}
  ],
  "assertions": [
    {{"column": "measure_name", "op": "gte", "value": 0}}
  ]
}}
"""

SINGLE_CUBE_PROMPT = """
You are building a semantic model cube for ONE table.

Table: {table_name}
Schema: {schema_context}
Column classifications: {classifications}
FK relationships: {fk_relationships}
Business rules: {business_rules}

Respond ONLY as valid JSON for a single cube object (no markdown, no comments):
{{
  "name": "table_name",
  "sql_table": "table_name",
  "joins": [],
  "dimensions": [{{"name": "col", "sql": "col", "type": "string", "description": ""}}],
  "measures": [{{"name": "col", "sql": "col_expr", "type": "sum", "description": ""}}]
}}
"""

# ── MAIN FUNCTION ──────────────────────────────────────────────────────────

async def generate_semantic_model(
    connection_id: str,
    business_rules: Optional[dict] = None
) -> dict:

    print(f"[SEM] START connection_id={connection_id} business_rules={business_rules}", flush=True)

    # Step 1: get schema
    schema = await get_schema(connection_id)
    print(f"[SEM] schema tables={list(schema.keys())}", flush=True)
    print(f"[SEM] table count={len(schema)}", flush=True)

    fks = get_foreign_keys(schema)
    print(f"[SEM] fk count={len(fks)}", flush=True)

    # Step 2: classify columns per table
    classifications = {}
    for table_name, table_data in schema.items():
        col_list = [
            f"{c['name']} ({c['type']})"
            + (" [PK]" if c["primary_key"] else "")
            + (f" [FK→{c['foreign_key']['foreign_table']}]"
               if c["foreign_key"] else "")
            for c in table_data["columns"]
        ]
        samples = table_data.get("sample_rows", [])[:2]
        response = await generate(
            CLASSIFY_PROMPT.format(
                table_name=table_name,
                columns="\n".join(col_list),
                samples=json.dumps(samples, default=str)
            )
        )
        try:
            classifications[table_name] = _parse_json(response)
            print(f"[SEM] classified {table_name}: {classifications[table_name]}", flush=True)
        except Exception as e:
            print(f"[SEM] classify FAILED for {table_name}: {e} | raw={response[:200]}", flush=True)
            classifications[table_name] = {
                c["name"]: "dimension"
                for c in table_data["columns"]
            }

    print(f"[SEM] classification done for {len(classifications)} tables", flush=True)

    # Step 3: generate clarification questions
    schema_summary = format_for_llm(schema, max_sample_rows=0)
    print(f"[SEM] schema_summary size={len(schema_summary)} chars ~{len(schema_summary)//4} tokens", flush=True)

    q_response = await generate(
        QUESTIONS_PROMPT.format(schema_summary=schema_summary)
    )
    try:
        questions = _parse_json(q_response)
        print(f"[SEM] questions generated: {len(questions)}", flush=True)
    except Exception as e:
        print(f"[SEM] questions FAILED: {e}", flush=True)
        questions = []

    # Step 4: if no business rules yet, return questions
    if not business_rules:
        print(f"[SEM] no business_rules, returning questions", flush=True)
        return {
            "status":    "needs_input",
            "questions": questions,
            "message":   "Answer these questions to improve model accuracy"
        }

    # Step 5: assemble the full model
    fk_text = "\n".join([
        f"{fk['from_table']}.{fk['from_column']} → "
        f"{fk['to_table']}.{fk['to_column']}"
        for fk in fks
    ])
    rules_text = "\n".join([
        f"- {k}: {v}" for k, v in business_rules.items()
    ])

    schema_context = format_for_llm(schema)
    classifications_json = json.dumps(classifications, indent=2)

    prompt_text = ASSEMBLE_PROMPT.format(
        schema_context=schema_context,
        classifications=classifications_json,
        fk_relationships=fk_text or "none detected",
        business_rules=rules_text or "none provided"
    )
    print(f"[SEM] ASSEMBLE prompt size={len(prompt_text)} chars ~{len(prompt_text)//4} tokens", flush=True)
    print(f"[SEM] schema_context size={len(schema_context)} chars", flush=True)
    print(f"[SEM] classifications_json size={len(classifications_json)} chars", flush=True)

    # If prompt is too large for context window (30k token limit = ~120k chars), skip straight to per-cube
    if len(prompt_text) > 100000:
        print(f"[SEM] prompt too large ({len(prompt_text)} chars), going straight to per-cube fallback", flush=True)
        model_dict = await _assemble_per_cube(schema, classifications, fk_text, rules_text)
        if model_dict is None:
            return {"status": "error", "detail": "Per-cube assembly failed — all tables returned bad JSON"}
    else:
        print(f"[SEM] sending ASSEMBLE prompt to LLM", flush=True)
        assemble_response = await generate(prompt_text, max_tokens=8192)
        print(f"[SEM] ASSEMBLE response size={len(assemble_response)} chars", flush=True)
        print(f"[SEM] ASSEMBLE response first 500: {assemble_response[:500]}", flush=True)

        model_dict = None
        try:
            model_dict = _parse_json(assemble_response)
            print(f"[SEM] parsed model_dict cubes={len(model_dict.get('cubes', []))}", flush=True)
            if len(model_dict.get("cubes", [])) == 0:
                print(f"[SEM] LLM returned 0 cubes — falling back to per-cube", flush=True)
                model_dict = await _assemble_per_cube(schema, classifications, fk_text, rules_text)
        except Exception as e:
            print(f"[SEM] parse FAILED: {e} — falling back to per-cube", flush=True)
            model_dict = await _assemble_per_cube(schema, classifications, fk_text, rules_text)
            if model_dict is None:
                return {"status": "error", "detail": f"LLM output parse failed: {e}"}

    if model_dict is None:
        print(f"[SEM] model_dict is None after all fallbacks", flush=True)
        return {"status": "error", "detail": "All assembly strategies failed"}

    print(f"[SEM] final cube count before save: {len(model_dict.get('cubes', []))}", flush=True)

    # Step 6: convert to SemanticModel and save
    model = _dict_to_model(model_dict)
    print(f"[SEM] _dict_to_model produced {len(model.cubes)} cubes", flush=True)
    path = engine.save(connection_id, model)
    print(f"[SEM] saved to {path}", flush=True)

    return {
        "status":     "ok",
        "model_path": str(path),
        "cubes":      [c.name for c in model.cubes],
        "message":    f"Semantic model generated with {len(model.cubes)} cubes"
    }

# ── HELPERS ────────────────────────────────────────────────────────────────

def _parse_json(text: str) -> any:
    # Strip BOM and null bytes that some models emit
    text = text.encode("utf-8", "ignore").decode("utf-8").strip("﻿\x00")
    text = text.strip()
    text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
    text = re.sub(r"\n?```$", "", text)
    text = text.strip()
    text = _extract_first_json(text)
    text = re.sub(r'(?m)//[^\n"]*$', "", text)
    text = re.sub(r",\s*([}\]])", r"\1", text)
    return json.loads(text)


def _extract_first_json(text: str) -> str:
    for start, open_char, close_char in [
        (text.find("{"), "{", "}"),
        (text.find("["), "[", "]"),
    ]:
        if start == -1:
            continue
        other_start = text.find("[") if open_char == "{" else text.find("{")
        if other_start != -1 and other_start < start:
            continue
        depth = 0
        in_string = False
        escape_next = False
        for i, ch in enumerate(text[start:], start):
            if escape_next:
                escape_next = False
                continue
            if ch == "\\" and in_string:
                escape_next = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == open_char:
                depth += 1
            elif ch == close_char:
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
    return text


async def _assemble_per_cube(
    schema: dict,
    classifications: dict,
    fk_text: str,
    rules_text: str,
) -> Optional[dict]:
    print(f"[SEM] _assemble_per_cube START tables={list(schema.keys())}", flush=True)
    cubes = []
    for table_name, table_data in schema.items():
        table_schema = format_for_llm({table_name: table_data})
        table_cls = json.dumps(
            {table_name: classifications.get(table_name, {})}, indent=2
        )
        print(f"[SEM] per-cube generating for {table_name} (schema={len(table_schema)} chars)", flush=True)
        response = await generate(
            SINGLE_CUBE_PROMPT.format(
                table_name=table_name,
                schema_context=table_schema,
                classifications=table_cls,
                fk_relationships=fk_text or "none detected",
                business_rules=rules_text or "none provided",
            ),
            max_tokens=2048,
        )
        print(f"[SEM] per-cube response for {table_name}: {response[:300]}", flush=True)
        try:
            cube_dict = _parse_json(response)
            print(f"[SEM] per-cube parsed OK for {table_name}: name={cube_dict.get('name')}", flush=True)
            cubes.append(cube_dict)
        except Exception as e:
            print(f"[SEM] per-cube parse FAILED for {table_name}: {e}", flush=True)
            continue

    print(f"[SEM] _assemble_per_cube done: {len(cubes)} cubes collected", flush=True)
    if not cubes:
        return None
    return {"cubes": cubes, "assertions": []}


def _dict_to_model(d: dict) -> SemanticModel:
    cubes = []
    for c in d.get("cubes", []):
        joins = [
            Join(
                name=j["name"],
                sql=j["sql"],
                relationship=j.get("relationship", "many_to_one")
            )
            for j in c.get("joins", [])
        ]
        dimensions = [
            Dimension(
                name=dim["name"],
                sql=dim["sql"],
                type=DimensionType(dim.get("type", "string")),
                description=dim.get("description", "")
            )
            for dim in c.get("dimensions", [])
        ]
        measures = [
            Measure(
                name=m["name"],
                sql=m["sql"],
                type=MeasureType(m.get("type", "sum")),
                description=m.get("description", "")
            )
            for m in c.get("measures", [])
        ]
        cubes.append(Cube(
            name=c["name"],
            sql_table=c["sql_table"],
            joins=joins,
            dimensions=dimensions,
            measures=measures
        ))
    return SemanticModel(
        cubes=cubes,
        assertions=d.get("assertions", [])
    )
