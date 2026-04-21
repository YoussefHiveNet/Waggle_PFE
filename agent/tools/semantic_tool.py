# agent/tools/semantic_tool.py
"""
semantic_tool.py

Takes a raw schema dict + optional user business rules
and uses the LLM to generate a semantic YAML model.

Pipeline:
  1. Classify each column (dimension / measure / time / skip)
  2. Confirm FK joins
  3. Generate business clarification questions
  4. Assemble YAML model
  5. Save via SemanticEngine
"""
import json
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

Respond ONLY as valid JSON:
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

# ── MAIN FUNCTION ──────────────────────────────────────────────────────────

async def generate_semantic_model(
    connection_id: str,
    business_rules: dict | None = None
) -> dict:
    """
    Full pipeline: schema → classify → questions → assemble → save.
    Returns a dict with the model path and generated questions.
    """
    # Step 1: get schema
    schema = await get_schema(connection_id)
    fks    = get_foreign_keys(schema)

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
        samples  = table_data.get("sample_rows", [])[:2]
        response = await generate(
            CLASSIFY_PROMPT.format(
                table_name=table_name,
                columns="\n".join(col_list),
                samples=json.dumps(samples, default=str)
            )
        )
        try:
            classifications[table_name] = _parse_json(response)
        except Exception:
            # Fallback: classify everything as dimension
            classifications[table_name] = {
                c["name"]: "dimension"
                for c in table_data["columns"]
            }

    # Step 3: generate clarification questions (returned to frontend)
    schema_summary = format_for_llm(schema, max_sample_rows=0)
    q_response     = await generate(
        QUESTIONS_PROMPT.format(schema_summary=schema_summary)
    )
    try:
        questions = _parse_json(q_response)
    except Exception:
        questions = []

    # Step 4: if no business rules yet, return questions for user to answer
    if not business_rules:
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

    assemble_response = await generate(
        ASSEMBLE_PROMPT.format(
            schema_context=format_for_llm(schema),
            classifications=json.dumps(classifications, indent=2),
            fk_relationships=fk_text or "none detected",
            business_rules=rules_text or "none provided"
        )
    )

    try:
        model_dict = _parse_json(assemble_response)
    except Exception as e:
        return {"status": "error", "detail": f"LLM output parse failed: {e}"}

    # Step 6: convert to SemanticModel and save
    model = _dict_to_model(model_dict)
    path  = engine.save(connection_id, model)

    return {
        "status":     "ok",
        "model_path": str(path),
        "cubes":      [c.name for c in model.cubes],
        "message":    f"Semantic model generated with {len(model.cubes)} cubes"
    }

# ── HELPERS ────────────────────────────────────────────────────────────────

def _parse_json(text: str) -> any:
    """Strip markdown fences and parse JSON."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text  = "\n".join(lines[1:-1])
    return json.loads(text)

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