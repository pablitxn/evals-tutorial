"""Provider schema compatibility and authoritative output validation regressions."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

from jsonschema import Draft7Validator
from tutorial_contracts import sha256, validate_contract
from tutorial_agents.prepared import DOMAINS
from tutorial_agents.provider_schema import provider_output_schema
import test_agents as support


class ProjectionTests(unittest.TestCase):
    def test_only_schema_keywords_are_projected_without_mutating_the_original(self):
        schema = {
            "type": "object", "additionalProperties": False,
            "properties": {
                "uniqueItems": {"type": "array", "uniqueItems": True, "items": {"type": "string"}},
                "choice": {"anyOf": [{"type": "array", "uniqueItems": True, "items": {"$ref": "#/$defs/id"}}, {"type": "null"}]},
                "literal": {"enum": [{"uniqueItems": True}], "const": {"uniqueItems": True}},
            },
            "$defs": {"id": {"type": "string", "minLength": 1}},
            "required": ["uniqueItems", "choice", "literal"],
        }
        original = deepcopy(schema)
        expected = deepcopy(schema)
        del expected["properties"]["uniqueItems"]["uniqueItems"]
        del expected["properties"]["choice"]["anyOf"][0]["uniqueItems"]
        projected = provider_output_schema(schema)
        self.assertEqual(projected, expected)
        self.assertEqual(schema, original)
        projected["$defs"]["id"]["minLength"] = 2
        self.assertEqual(schema, original)

    def test_all_installed_schema_shapes_and_other_constraints_are_preserved(self):
        for exercise, domain in DOMAINS.items():
            with self.subTest(exercise=exercise):
                original = deepcopy(domain["outputSchema"])
                expected = deepcopy(original)
                if exercise == "03-independent-tie-out":
                    for field in ("wages", "withholding"):
                        del expected["properties"][field]["properties"]["documentIds"]["uniqueItems"]
                elif exercise == "05-package-readiness":
                    for field in ("missingDocumentIds", "unresolvedDiscrepancyIds"):
                        del expected["properties"][field]["uniqueItems"]
                projected = provider_output_schema(domain["outputSchema"])
                self.assertEqual(projected, expected)
                self.assertEqual(domain["outputSchema"], original)
                Draft7Validator.check_schema(projected)
                Draft7Validator(projected).validate(support.MOCK_OUTPUTS[exercise])


class ProviderSchemaWireTests(unittest.IsolatedAsyncioTestCase):
    async def test_both_providers_receive_compatible_copies_for_every_agent(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.png"
            path.write_bytes(support.PNG)
            document = {"id": "page-1", "absolutePath": str(path), "sha256": sha256(support.PNG), "mimeType": "image/png"}
            for provider in ("openai", "azure_foundry"):
                for exercise, domain in DOMAINS.items():
                    with self.subTest(provider=provider, exercise=exercise):
                        original = deepcopy(domain["outputSchema"])
                        payload = support.request(exerciseId=exercise, input=support.CASE_INPUTS[exercise], documents=[document] if exercise in ("02-document-classification", "03-independent-tie-out") else [])
                        request_before = deepcopy(payload)
                        result, calls = await support.SDKTests.run_mock(self, payload, text=json.dumps(support.MOCK_OUTPUTS[exercise]), provider=provider)
                        self.assertEqual(result["status"], "completed")
                        self.assertEqual(len(calls), 1)
                        wire_schema = calls[0][1]["text"]["format"]
                        self.assertTrue(wire_schema["strict"])
                        self.assertEqual(wire_schema["schema"], provider_output_schema(original))
                        self.assertEqual(domain["outputSchema"], original)
                        self.assertEqual(payload, request_before)

    async def test_duplicate_ids_still_fail_full_domain_validation_after_inference(self):
        fields = {
            "03-independent-tie-out": (("wages", "documentIds"), ("withholding", "documentIds")),
            "05-package-readiness": (("missingDocumentIds",), ("unresolvedDiscrepancyIds",)),
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.png"
            path.write_bytes(support.PNG)
            document = {"id": "page-1", "absolutePath": str(path), "sha256": sha256(support.PNG), "mimeType": "image/png"}
            for provider in ("openai", "azure_foundry"):
                for exercise, paths in fields.items():
                    for field_path in paths:
                        with self.subTest(provider=provider, exercise=exercise, field=field_path):
                            # JSON round-trip separates the shared indeterminate
                            # test record so only the selected field is invalid.
                            output = json.loads(json.dumps(support.MOCK_OUTPUTS[exercise]))
                            target = output
                            for field in field_path[:-1]:
                                target = target[field]
                            target[field_path[-1]] = ["page-1", "page-1"]
                            # This is provider-schema-valid but domain-invalid.
                            Draft7Validator(provider_output_schema(DOMAINS[exercise]["outputSchema"])).validate(output)
                            payload = support.request(exerciseId=exercise, input=support.CASE_INPUTS[exercise], documents=[document] if exercise == "03-independent-tie-out" else [])
                            result, calls = await support.SDKTests.run_mock(self, payload, text=json.dumps(output), provider=provider)
                            validate_contract("AgentResponse", result)
                            self.assertEqual(len(calls), 1)
                            self.assertEqual(result["status"], "failed")
                            self.assertEqual(result["error"]["code"], "agent_output_schema")
                            self.assertNotIn("output", result)
                            self.assertNotIn("score", result)


if __name__ == "__main__":
    unittest.main()
