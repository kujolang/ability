import json
import sys

sys.path.insert(0, "sdk/python")
from kujo_ability import ability_definition_digest_v2, review_effects, validate_ability_definition, validate_ability_receipt

with open("tests/fixtures/sdk_conformance.json", encoding="utf-8") as stream:
    fixture = json.load(stream)
definition = validate_ability_definition(fixture["definition"])
receipt = validate_ability_receipt(fixture["receipt"])
digest = ability_definition_digest_v2(fixture["definition"])
if not definition["ok"] or not receipt["ok"] or not digest["ok"]: raise SystemExit("Python conformance fixture failed")
invalid = {**fixture["definition"], "effects": [{"kind": "shell", "resource": "kujo.docs.content"}]}
rejected = validate_ability_definition(invalid)
if rejected["ok"]: raise SystemExit("Python SDK accepted an invalid effect")
print(json.dumps({"digest": digest["value"], "effectReview": review_effects(definition["value"]), "invalidCode": rejected["code"], "receiptStatus": fixture["receipt"]["status"]}, separators=(",", ":")))
