# semantic/models.py
from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

class DimensionType(Enum):
    STRING  = "string"
    NUMBER  = "number"
    TIME    = "time"
    BOOLEAN = "boolean"

class MeasureType(Enum):
    SUM            = "sum"
    COUNT          = "count"
    COUNT_DISTINCT = "count_distinct"
    AVG            = "avg"
    MAX            = "max"
    MIN            = "min"
    NUMBER         = "number"

@dataclass
class Dimension:
    name:        str
    sql:         str
    type:        DimensionType
    description: str  = ""
    primary_key: bool = False

@dataclass
class Measure:
    name:        str
    sql:         str
    type:        MeasureType
    description: str = ""

    def to_sql_expression(self) -> str:
        if self.type == MeasureType.COUNT:
            return f"COUNT({self.sql})"
        elif self.type == MeasureType.COUNT_DISTINCT:
            return f"COUNT(DISTINCT {self.sql})"
        elif self.type == MeasureType.SUM:
            return f"SUM({self.sql})"
        elif self.type == MeasureType.AVG:
            return f"AVG({self.sql})"
        elif self.type == MeasureType.MAX:
            return f"MAX({self.sql})"
        elif self.type == MeasureType.MIN:
            return f"MIN({self.sql})"
        elif self.type == MeasureType.NUMBER:
            return self.sql
        return f"SUM({self.sql})"

@dataclass
class Join:
    name:         str
    sql:          str
    relationship: str  # many_to_one | one_to_many | one_to_one

@dataclass
class Cube:
    name:       str
    sql_table:  str
    joins:      list[Join]      = field(default_factory=list)
    dimensions: list[Dimension] = field(default_factory=list)
    measures:   list[Measure]   = field(default_factory=list)

    def find_dimension(self, name: str) -> Optional[Dimension]:
        return next((d for d in self.dimensions if d.name == name), None)

    def find_measure(self, name: str) -> Optional[Measure]:
        return next((m for m in self.measures if m.name == name), None)

    def all_field_names(self) -> list[str]:
        return [d.name for d in self.dimensions] + \
               [m.name for m in self.measures]

@dataclass
class SemanticModel:
    cubes:      list[Cube]
    assertions: list[dict] = field(default_factory=list)

    def find_cube(self, name: str) -> Optional[Cube]:
        return next((c for c in self.cubes if c.name == name), None)