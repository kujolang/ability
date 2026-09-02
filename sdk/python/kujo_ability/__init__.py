"""Dependency-free Kujo Ability contract helpers."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Awaitable, Callable, Dict, Mapping, Protocol, Union

ABILITY_SCHEMA_ID = "kujo.ability/v1"
ABILITY_RECEIPT_SCHEMA_ID = "kujo.ability.receipt/v1"
ABILITY_ID = re.compile(r"^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*){2,}$")
VERSION = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")
DIGEST = re.compile(r"^[a-f0-9]{64}$")
DEFINITION_FIELDS = {"schema", "id", "version", "title", "description", "input_schema", "output_schema", "effects", "idempotency"}
RECEIPT_FIELDS = {"schema", "receipt_id", "invocation_id", "ability_id", "ability_version", "definition_digest", "handler_id", "handler_version", "status", "result", "error", "policy_decision", "approval_id", "idempotency", "request_id", "trace_id", "surface", "principal", "started_at_ms", "completed_at_ms", "duration_ms", "audit", "metadata"}

class AbilityHandler(Protocol):
    def __call__(self, input_value: Any, context: Mapping[str, Any]) -> Union[Any, Awaitable[Any]]: ...

def _failure(code: str, message: str, details: Dict[str, Any] | None = None) -> Dict[str, Any]:
    return {"ok": False, "code": code, "message": message, "details": details or {}}

def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

def _valid_identity(value: Any) -> bool:
    if not isinstance(value, dict) or any(key not in {"type", "id", "tenant_id", "claims"} for key in value): return False
    identity_type, identity_id, tenant_id = value.get("type"), value.get("id"), value.get("tenant_id", "")
    return isinstance(identity_type, str) and 1 <= len(identity_type.strip()) <= 64 and isinstance(identity_id, str) and 1 <= len(identity_id.strip()) <= 256 and isinstance(tenant_id, str) and len(tenant_id) <= 256 and isinstance(value.get("claims", {}), dict)

def validate_ability_definition(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict): return _failure("invalid_ability_definition", "Ability definition must be an object")
    unknown = next((key for key in value if key not in DEFINITION_FIELDS), None)
    if unknown: return _failure("unknown_ability_field", "Ability definition contains an unsupported field", {"field": unknown})
    if value.get("schema") != ABILITY_SCHEMA_ID: return _failure("invalid_ability_schema_id", f"schema must be {ABILITY_SCHEMA_ID}")
    ability_id = value.get("id")
    if not isinstance(ability_id, str) or len(ability_id) > 240 or not ABILITY_ID.fullmatch(ability_id): return _failure("invalid_ability_id", "id must be a lowercase dotted identifier with at least three segments")
    ability_version = value.get("version")
    if not isinstance(ability_version, str) or not VERSION.fullmatch(ability_version): return _failure("invalid_ability_version", "version must be numeric major.minor.patch text")
    description = value.get("description")
    if not isinstance(description, str) or not 3 <= len(description.strip()) <= 1000: return _failure("invalid_ability_description", "description must contain 3 to 1000 characters")
    title = value.get("title")
    if title is not None and (not isinstance(title, str) or len(title.strip()) > 160): return _failure("invalid_ability_title", "title must contain at most 160 characters")
    if not isinstance(value.get("input_schema"), dict) or not isinstance(value.get("output_schema"), dict): return _failure("invalid_ability_schema", "input_schema and output_schema must be objects")
    effects = value.get("effects")
    if not isinstance(effects, list) or not 1 <= len(effects) <= 16: return _failure("invalid_ability_effects", "effects must contain 1 to 16 declarations")
    for effect in effects:
        if not isinstance(effect, dict) or any(key not in {"kind", "resource"} for key in effect): return _failure("invalid_ability_effect", "Each effect must contain only kind and resource")
        if effect.get("kind") not in {"read", "write", "delete", "external"}: return _failure("invalid_ability_effect_kind", "Effect kind must be read, write, delete, or external")
        resource = effect.get("resource")
        if not isinstance(resource, str) or len(resource) > 240 or not ABILITY_ID.fullmatch(resource): return _failure("invalid_ability_effect_resource", "Effect resource must be a lowercase dotted identifier")
    idempotency = value.get("idempotency")
    if not isinstance(idempotency, dict) or any(key != "mode" for key in idempotency) or idempotency.get("mode") not in {"intrinsic", "keyed", "none"}: return _failure("invalid_ability_idempotency_mode", "idempotency.mode must be intrinsic, keyed, or none")
    return {"ok": True, "value": value}

def ability_definition_digest_v2(value: Any) -> Dict[str, Any]:
    checked = validate_ability_definition(value)
    if not checked["ok"]: return checked
    return {"ok": True, "value": hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()}

def validate_ability_receipt(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict): return _failure("invalid_ability_receipt", "Ability receipt must be an object")
    unknown = next((key for key in value if key not in RECEIPT_FIELDS), None)
    if unknown: return _failure("unknown_ability_receipt_field", "Ability receipt contains an unsupported field", {"field": unknown})
    if value.get("schema") != ABILITY_RECEIPT_SCHEMA_ID: return _failure("invalid_ability_receipt_schema", f"receipt.schema must be {ABILITY_RECEIPT_SCHEMA_ID}")
    for field in ["receipt_id", "invocation_id", "ability_id", "ability_version", "handler_id", "handler_version", "status", "request_id", "trace_id", "surface"]:
        item = value.get(field)
        if not isinstance(item, str) or not 1 <= len(item.strip()) <= 240: return _failure("invalid_ability_receipt", "Receipt field is required", {"field": field})
    if not ABILITY_ID.fullmatch(value["ability_id"]) or not VERSION.fullmatch(value["ability_version"]) or not VERSION.fullmatch(value["handler_version"]): return _failure("invalid_ability_receipt_identity", "Receipt contains invalid versioned identity")
    if not isinstance(value.get("definition_digest"), str) or not DIGEST.fullmatch(value["definition_digest"]): return _failure("invalid_ability_receipt_digest", "Receipt definition_digest is invalid")
    if value["status"] not in {"succeeded", "rejected", "approval_required", "failed", "timed_out", "cancelled", "in_progress"}: return _failure("invalid_ability_receipt_status", "Receipt status is unsupported")
    started, completed, duration = value.get("started_at_ms"), value.get("completed_at_ms"), value.get("duration_ms")
    if any(not isinstance(item, int) or isinstance(item, bool) or item < 0 for item in (started, completed, duration)) or completed < started or duration != completed - started: return _failure("invalid_ability_receipt_timing", "Receipt timing is inconsistent")
    if not _valid_identity(value.get("principal")): return _failure("invalid_ability_identity", "principal must be a valid identity", {"field": "principal"})
    for field in ["policy_decision", "idempotency", "audit", "metadata"]:
        if not isinstance(value.get(field), dict): return _failure("invalid_ability_receipt_metadata", "Receipt metadata fields must be objects", {"field": field})
    return {"ok": True, "value": value}

def review_effects(definition: Mapping[str, Any]) -> Dict[str, Any]:
    kinds = sorted({effect["kind"] for effect in definition["effects"]})
    return {"readOnly": all(kind == "read" for kind in kinds), "approvalRecommended": any(kind != "read" for kind in kinds), "kinds": kinds}
