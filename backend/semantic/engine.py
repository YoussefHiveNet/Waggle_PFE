# semantic/engine.py
import yaml
from pathlib import Path
from typing import Optional
from semantic.models import (
    SemanticModel, Cube, Dimension, Measure, Join,
    DimensionType, MeasureType
)

class SemanticEngine:
    def __init__(self, model_dir: str = "semantic/models"):
        self.model_dir = Path(model_dir)
        self._cache: dict[str, SemanticModel] = {}

    def load(self, connection_id: str) -> SemanticModel:
        if connection_id in self._cache:
            return self._cache[connection_id]
        path = self.model_dir / f"{connection_id}.yaml"
        if not path.exists():
            raise FileNotFoundError(
                f"No semantic model for '{connection_id}'. "
                f"Run POST /semantic/{connection_id} first."
            )
        raw   = yaml.safe_load(path.read_text())
        model = self._parse_model(raw)
        self._cache[connection_id] = model
        return model

    def save(self, connection_id: str, model: SemanticModel) -> Path:
        self.model_dir.mkdir(parents=True, exist_ok=True)
        path = self.model_dir / f"{connection_id}.yaml"
        raw  = self._serialize_model(model)
        path.write_text(
            yaml.dump(raw, default_flow_style=False, sort_keys=False)
        )
        self._cache.pop(connection_id, None)
        return path

    def exists(self, connection_id: str) -> bool:
        return (self.model_dir / f"{connection_id}.yaml").exists()

    def invalidate(self, connection_id: str):
        self._cache.pop(connection_id, None)

    def build_llm_context(
        self,
        model: SemanticModel,
        relevant_cubes: Optional[list[Cube]] = None
    ) -> str:
        cubes = relevant_cubes or model.cubes
        lines = ["SEMANTIC MODEL — use these to write SQL:\n"]
        for cube in cubes:
            lines.append(f"TABLE: {cube.sql_table}")
            if cube.dimensions:
                lines.append("  Dimensions:")
                for d in cube.dimensions:
                    desc = f" — {d.description}" if d.description else ""
                    lines.append(
                        f"    {d.name} ({d.type.value}): {d.sql}{desc}"
                    )
            if cube.measures:
                lines.append("  Measures (pre-aggregated):")
                for m in cube.measures:
                    desc = f" — {m.description}" if m.description else ""
                    lines.append(
                        f"    {m.name}: {m.sql}{desc}"
                    )
            if cube.joins:
                lines.append("  Joins:")
                for j in cube.joins:
                    lines.append(
                        f"    JOIN {j.name} ON {j.sql} [{j.relationship}]"
                    )
            lines.append("")
        return "\n".join(lines)

    # ── PARSE ─────────────────────────────────────────────────────────

    def _parse_model(self, raw: dict) -> SemanticModel:
        cubes      = [self._parse_cube(c) for c in raw.get("cubes", [])]
        assertions = raw.get("assertions", [])
        return SemanticModel(cubes=cubes, assertions=assertions)

    def _parse_cube(self, raw: dict) -> Cube:
        joins = [
            Join(
                name=j["name"],
                sql=j["sql"],
                relationship=j.get("relationship", "many_to_one")
            )
            for j in raw.get("joins", [])
        ]
        dimensions = [
            Dimension(
                name=d["name"],
                sql=d["sql"],
                type=DimensionType(d.get("type", "string")),
                description=d.get("description", ""),
                primary_key=d.get("primary_key", False)
            )
            for d in raw.get("dimensions", [])
        ]
        measures = [
            Measure(
                name=m["name"],
                sql=m["sql"],
                type=MeasureType(m.get("type", "sum")),
                description=m.get("description", "")
            )
            for m in raw.get("measures", [])
        ]
        return Cube(
            name=raw["name"],
            sql_table=raw["sql_table"],
            joins=joins,
            dimensions=dimensions,
            measures=measures
        )

    def _serialize_model(self, model: SemanticModel) -> dict:
        return {
            "cubes": [
                {
                    "name":      c.name,
                    "sql_table": c.sql_table,
                    "joins": [
                        {
                            "name":         j.name,
                            "sql":          j.sql,
                            "relationship": j.relationship
                        }
                        for j in c.joins
                    ],
                    "dimensions": [
                        {
                            "name":        d.name,
                            "sql":         d.sql,
                            "type":        d.type.value,
                            "description": d.description,
                            **({"primary_key": True} if d.primary_key else {})
                        }
                        for d in c.dimensions
                    ],
                    "measures": [
                        {
                            "name":        m.name,
                            "sql":         m.sql,
                            "type":        m.type.value,
                            "description": m.description
                        }
                        for m in c.measures
                    ]
                }
                for c in model.cubes
            ],
            "assertions": model.assertions
        }