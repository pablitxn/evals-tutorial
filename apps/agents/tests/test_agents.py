"""Offline SDK wire tests. MockTransport makes network inference impossible."""
import asyncio
import base64
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import httpx2
from tutorial_contracts import canonical_json, sha256, validate_contract
from tutorial_agents.prepared import PROMPTS, prepared_agent
from tutorial_agents.runtime import Profile, make_client, strict_json
from tutorial_agents.service import invoke
from tutorial_agents.broker import invoke_broker

ENV = {"TUTORIAL_PROVIDER": "openai", "TUTORIAL_MODEL": "mock-global-model", "TUTORIAL_API_KEY": "offline-placeholder"}
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0ioAAAAASUVORK5CYII=")
CASE_INPUTS = {
    "intro": {"messageId": "m-1", "text": "Synthetic message", "starred": True},
    "01-starred-classifier": {"messageId": "m-1", "text": "Synthetic message", "starred": True},
    "02-document-classification": {"documentId": "page-1", "documentSetId": "tax-demo-v1"},
    "03-independent-tie-out": {"documentSetId": "tax-demo-v1", "documentIds": ["page-1"], "taxYear": 2025, "currency": "USD"},
    "04-policy-recommendation": {"policyId": "workshop-equipment-v1", "policy": [{"id": "p-1", "text": "Need cost evidence."}], "question": "How to record a synthetic purchase?", "facts": [{"id": "f-1", "text": "Cost is missing."}]},
    "05-package-readiness": {"packageId": "package-1", "requiredDocumentIds": [], "presentDocumentIds": [], "unresolvedDiscrepancyIds": [], "humanApproval": "pending"},
    "06-simulated-travel": {"origin": "AAA", "destination": "BBB", "departDate": "2026-11-01", "returnDate": "2026-11-02", "budgetCents": 100, "currency": "USD", "options": []},
}
CASE_INPUTS["07-spec-regression"] = CASE_INPUTS["06-simulated-travel"]
INDETERMINATE = {"w2SumCents": None, "form1040Cents": None, "deltaCents": None, "verdict": "indeterminate", "documentIds": ["page-1"]}
# These are synthetic test outputs, not corpus expected records; never passed to agents.
MOCK_OUTPUTS = {
    "intro": {"label": "starred"}, "01-starred-classifier": {"label": "starred"},
    "02-document-classification": {"documentId": "page-1", "formType": "unknown", "readability": "unreadable"},
    "03-independent-tie-out": {"currency": "USD", "readings": [{"documentId": "page-1", "formType": "unknown", "status": "unreadable", "wagesCents": None, "withholdingCents": None, "interestCents": None}], "wages": INDETERMINATE, "withholding": INDETERMINATE},
    "04-policy-recommendation": {"decision": "insufficient_evidence", "recommendation": "Need cost evidence.", "citations": [{"clauseId": "p-1", "quote": "Need cost evidence."}], "evidenceIds": ["f-1"]},
    "05-package-readiness": {"packageId": "package-1", "status": "ready_for_review", "missingDocumentIds": [], "unresolvedDiscrepancyIds": [], "humanApproval": "pending", "transmission": "not_sent"},
    "06-simulated-travel": {"status": "no_options", "optionId": None, "departDate": None, "returnDate": None, "totalCents": None, "currency": "USD", "simulated": True, "booked": False},
}
MOCK_OUTPUTS["07-spec-regression"] = MOCK_OUTPUTS["06-simulated-travel"]
def request(**changes):
    return {"schemaVersion": "1.0.0", "runId": "run-1", "exampleId": "example-1", "exerciseId": "01-starred-classifier", "agentVariant": "baseline", "input": CASE_INPUTS["01-starred-classifier"], "documents": [], "deadlineMs": 1000, **changes}

class SDKTests(unittest.IsolatedAsyncioTestCase):
    async def run_mock(self, payload, text='{"label":"starred"}', refusal=False, delay=0, status=200, broker=False, provider="openai", trace_id=None):
        requests = []
        async def handle(req):
            body = json.loads(req.content)
            # Collect only URL/body; credentials never enter test evidence.
            requests.append((str(req.url), body))
            if delay: await asyncio.sleep(delay)
            if status != 200: return httpx2.Response(status, json={"error": {"message": "SECRET must not leak", "type": "error"}})
            content = {"type": "refusal", "refusal": "No"} if refusal else {"type": "output_text", "text": text, "annotations": []}
            return httpx2.Response(200, json={"id": "resp_mock", "object": "response", "created_at": 1, "model": "mock-global-model", "status": "completed", "output": [{"type": "message", "id": "msg_mock", "role": "assistant", "status": "completed", "content": [content]}], "usage": {"input_tokens": 1, "output_tokens": 2, "total_tokens": 3}})
        env = dict(ENV)
        if provider == "azure_foundry": env.update(TUTORIAL_PROVIDER=provider, TUTORIAL_AZURE_ENDPOINT="https://synthetic.openai.azure.com", TUTORIAL_API_VERSION="test-version")
        async with httpx2.AsyncClient(transport=httpx2.MockTransport(handle)) as http:
            def factory(profile, timeout): return make_client(profile, timeout, http)
            with patch.dict(os.environ, env, clear=True):
                output = await (invoke_broker(payload, factory) if broker else invoke(payload, client_factory=factory, trace_id=trace_id))
        return output, requests

    async def test_all_prepared_agents_use_explicit_global_profile(self):
        with tempfile.TemporaryDirectory() as directory:
          path = Path(directory) / "synthetic.png"
          path.write_bytes(PNG)
          document = {"id": "page-1", "absolutePath": str(path), "sha256": sha256(PNG), "mimeType": "image/png"}
          for provider in ("openai", "azure_foundry"):
            for exercise in PROMPTS:
                docs = [document] if exercise in ("02-document-classification", "03-independent-tie-out") else []
                output, calls = await self.run_mock(request(exerciseId=exercise, input=CASE_INPUTS[exercise], documents=docs), text=json.dumps(MOCK_OUTPUTS[exercise]), provider=provider)
                self.assertEqual(output["status"], "completed")
                validate_contract("AgentResponse", output)
                self.assertEqual(output["usage"], {"inputTokens": 1, "outputTokens": 2})
                self.assertEqual(len(calls), 1)
                url, body = calls[0]
                self.assertEqual(body["model"], "mock-global-model")
                self.assertEqual(body["max_output_tokens"], 2048)
                self.assertEqual(body["text"]["format"]["type"], "json_schema")
                self.assertFalse(body.get("store", True))
                self.assertFalse(body.get("tools"))
                self.assertNotIn("expected", json.dumps(body))
                self.assertIn("synthetic.openai.azure.com" if provider == "azure_foundry" else "api.openai.com", url)
                if provider == "azure_foundry": self.assertIn("api-version=test-version", url)

    async def test_regression_variants_use_real_infer_boundary_with_distinct_exact_prompts(self):
        for variant in ("baseline", "omit-fees"):
            payload = request(exerciseId="07-spec-regression", agentVariant=variant, input=CASE_INPUTS["07-spec-regression"])
            output, calls = await self.run_mock(payload, text=json.dumps(MOCK_OUTPUTS["07-spec-regression"]))
            self.assertEqual(output["status"], "completed")
            self.assertEqual(len(calls), 1)
            body = calls[0][1]
            self.assertIn(prepared_agent("07-spec-regression", variant).instructions, json.dumps(body, ensure_ascii=False).replace("\\n", "\n"))
            self.assertNotIn("eligibleOptionIds", json.dumps(body))
            self.assertNotIn("expectedByRequirement", json.dumps(body))
            self.assertNotIn("fixtures", json.dumps(body))
            self.assertEqual(body["text"]["format"]["type"], "json_schema")
        self.assertEqual(prepared_agent("07-spec-regression", "baseline").instructions,
                         prepared_agent("06-simulated-travel", "baseline").instructions)
        for exercise, variant in (("07-spec-regression", "careful"), ("06-simulated-travel", "omit-fees")):
            output, calls = await self.run_mock(request(exerciseId=exercise, agentVariant=variant, input=CASE_INPUTS[exercise]))
            self.assertEqual(output["error"]["code"], "invalid_request")
            self.assertEqual(calls, [])
        for material in ({"expected": {}}, {"fixtures": []}, {"nested": {"reference": {}}}):
            output, calls = await self.run_mock(request(exerciseId="07-spec-regression", agentVariant="omit-fees", input={**CASE_INPUTS["07-spec-regression"], **material}))
            self.assertEqual(output["error"]["code"], "invalid_request")
            self.assertEqual(calls, [])

    async def test_document_serialization_uses_bytes_ids_and_no_reference(self):
        png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0ioAAAAASUVORK5CYII=")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.png"
            path.write_bytes(png)
            doc = {"id": "page-1", "absolutePath": str(path), "sha256": sha256(png), "mimeType": "image/png"}
            output, calls = await self.run_mock(request(exerciseId="02-document-classification", input=CASE_INPUTS["02-document-classification"], documents=[doc]), text=json.dumps(MOCK_OUTPUTS["02-document-classification"]))
            self.assertEqual(output["status"], "completed")
            content = calls[0][1]["input"][-1]["content"]
            self.assertTrue(any(c["type"] == "input_image" for c in content))
            self.assertNotIn(str(path), json.dumps(calls[0][1]))
            doc["sha256"] = "0" * 64
            output, calls = await self.run_mock(request(exerciseId="02-document-classification", input=CASE_INPUTS["02-document-classification"], documents=[doc]))
            self.assertEqual(output["error"]["code"], "invalid_request")
            self.assertEqual(calls, [])

    async def test_reference_and_unknown_variant_excluded_before_inference(self):
        for changes in ({"expected": {}}, {"input": {"starred": True, "nested": {"fixtures": []}}}, {"agentVariant": "worker-url"}, {"deadlineMs": 60001}):
            output, calls = await self.run_mock(request(**changes))
            self.assertEqual(output["error"]["code"], "invalid_request")
            self.assertEqual(calls, [])

    async def test_malformed_nonfinite_duplicate_and_array_outputs_fail(self):
        for text in ("no JSON", "[]", '{"label":"x","label":"y"}', '{"amount":NaN}'):
            output, _ = await self.run_mock(request(), text=text)
            self.assertEqual(output["error"]["code"], "agent_output_schema")

    async def test_refusal_timeout_and_cancellation_are_operational_errors(self):
        output, _ = await self.run_mock(request(), refusal=True)
        self.assertEqual(output["error"]["code"], "provider_refusal")
        output, _ = await self.run_mock(request(deadlineMs=5), delay=.05)
        self.assertEqual(output["error"]["code"], "timeout")
        task = asyncio.create_task(self.run_mock(request(), delay=.2))
        await asyncio.sleep(.02)
        task.cancel()
        output, _ = await task
        self.assertEqual(output["error"]["code"], "cancelled")

    async def test_provider_errors_have_zero_retries_and_no_secret(self):
        for status in (401, 429, 500):
            output, calls = await self.run_mock(request(), status=status)
            self.assertEqual(output["error"]["code"], "provider_unavailable")
            self.assertEqual(len(calls), 1)
            self.assertNotIn("SECRET", json.dumps(output))

    async def test_judge_and_review_use_same_model_structured_output_no_tools(self):
        for provider in ("openai", "azure_foundry"):
            for role, text in (("judge", '{"score":1,"label":"pass","explanation":"Evidence matches."}'), ("review", '{"status":"inconclusive","summary":"Inspect evidence.","findings":[]}')):
                code = "__import__('os').system('touch /tmp/never-execute-review')"
                payload = {"role": role, "material": {"source": code}, "maxOutputTokens": 128, "deadlineMs": 1000}
                if role == "review":
                    payload["material"]["evidenceQuotes"] = [{"id": "quote-1", "kind": "source", "quote": code, "exampleIds": []}]
                output, calls = await self.run_mock(payload, text=text, broker=True, provider=provider)
                self.assertIn("result", output)
                self.assertEqual(calls[0][1]["max_output_tokens"], 128)
                self.assertEqual(calls[0][1]["model"], "mock-global-model")
                self.assertEqual(calls[0][1]["text"]["format"]["type"], "json_schema")
                self.assertFalse(calls[0][1].get("tools"))
                self.assertFalse(Path("/tmp/never-execute-review").exists())

    async def test_judge_contradictory_score_and_review_malformed_are_errors(self):
        payload = {"role": "judge", "material": {}, "maxOutputTokens": 128, "deadlineMs": 1000}
        for text in ('{"score":0,"label":"pass","explanation":"Bad mapping"}', '{"score":"1","label":"pass","explanation":"Coercion forbidden"}', '{"score":0,"score":1,"label":"pass","explanation":"Duplicate key"}'):
            output, _ = await self.run_mock(payload, text=text, broker=True)
            self.assertEqual(output["error"]["code"], "agent_output_schema")
        payload["role"] = "review"
        payload["material"] = {"evidenceQuotes": [{"id": "quote-1", "kind": "source", "quote": "synthetic source", "exampleIds": []}]}
        output, _ = await self.run_mock(payload, text='{"status":"ready"}', broker=True)
        self.assertEqual(output["error"]["code"], "review_output_schema")

    async def test_w3c_trace_continuity_without_sensitive_telemetry(self):
        from tutorial_agents import runtime
        from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
        exporter = InMemorySpanExporter()
        configure = runtime.configure_otel_providers
        def in_memory(**kwargs):
            kwargs["exporters"] = [exporter]
            return configure(**kwargs)
        payload = request(traceparent="00-" + "1" * 32 + "-" + "2" * 16 + "-01")
        with patch.dict(os.environ, {"TUTORIAL_TRACE_PROJECT": "mock-source-project"}, clear=True), patch.object(runtime, "configure_otel_providers", side_effect=in_memory):
            with runtime.tracing(payload) as trace_id:
                output, _ = await self.run_mock(payload, trace_id=trace_id)
        spans = exporter.get_finished_spans()
        self.assertEqual(output["traceId"], "1" * 32)
        self.assertGreaterEqual(len(spans), 3)
        self.assertTrue(all(format(span.context.trace_id, "032x") == "1" * 32 for span in spans))
        self.assertTrue(all(span.resource.attributes["openinference.project.name"] == "mock-source-project" for span in spans))
        self.assertNotIn("offline-placeholder", str([dict(span.attributes) for span in spans]))

class ProfileTests(unittest.TestCase):
    def test_regression_consultation_contains_both_exact_prompts_and_runtime_hashes(self):
        from tutorial_agents.prepared import DOMAINS
        from tutorial_agents.service import source_hash
        root = Path(__file__).resolve().parents[3]
        snapshot = json.loads((root / "content/consultation-sources.json").read_text())
        consultation = snapshot["sources"]["07-spec-regression"]
        maf = (root / "apps/agents/src/tutorial_agents/maf.py").read_text()
        self.assertTrue(consultation["pythonSource"].startswith(maf))
        self.assertEqual(snapshot["sourceFileHash"], sha256(maf))
        self.assertEqual(consultation["sourceHash"], source_hash())
        self.assertEqual((root / "content/exercises/07-spec-regression/agent_consultation.py").read_text(), consultation["pythonSource"])
        for variant in ("baseline", "omit-fees"):
            prompt = prepared_agent("07-spec-regression", variant).instructions
            self.assertIn("".join(("# " + line if line else "#") + "\n" for line in prompt.splitlines()), consultation["pythonSource"])
            expected_hash = sha256(prompt + "\n" + canonical_json(DOMAINS["07-spec-regression"]["outputSchema"]))
            self.assertEqual(consultation["promptHashes"][variant], expected_hash)
        self.assertNotEqual(consultation["promptHashes"]["baseline"], consultation["promptHashes"]["omit-fees"])

    def test_no_ambient_provider_fallback(self):
        from tutorial_agents.runtime import profile_from_env, OperationFailure
        for env in ({}, {"OPENAI_API_KEY": "offline-placeholder"}, {**ENV, "TUTORIAL_PROVIDER": "other"}, {**ENV, "TUTORIAL_PROVIDER": "azure_foundry", "TUTORIAL_AZURE_ENDPOINT": "https://x.services.ai.azure.com/api/projects/y"}):
            with self.assertRaises(OperationFailure): profile_from_env(env)
        self.assertNotIn("offline-placeholder", repr(profile_from_env(ENV)))

    def test_strict_json_rejects_unportable_numbers(self):
        for value in ('{"x":9007199254740992}', '{"x":Infinity}', '{"x":1,"x":2}'):
            with self.assertRaises(ValueError): strict_json(value)

class ProtocolTests(unittest.TestCase):
    def run_process(self, data):
        root = Path(__file__).resolve().parents[3]
        env = {"PYTHONPATH": os.pathsep.join((str(root / "apps/agents/src"), str(root / "packages/contracts/python"))), "PYTHONUTF8": "1", "PYTHONDONTWRITEBYTECODE": "1"}
        return subprocess.run([sys.executable, "-m", "tutorial_agents"], input=data, capture_output=True, env=env, timeout=5)

    def test_jsonl_malformed_extra_line_and_oversize_rejected(self):
        for data in (b"not-json\n", b"{}\n{}\n", b"{}", b"x" * 1048577 + b"\n"):
            process = self.run_process(data)
            self.assertEqual(process.returncode, 0)
            self.assertEqual(process.stdout.count(b"\n"), 1)
            response = json.loads(process.stdout)
            validate_contract("AgentResponse", response)
            self.assertEqual(response["error"]["code"], "protocol_error")
            self.assertNotIn(b"Traceback", process.stderr)

    def test_missing_profile_has_correlated_failure_and_no_inference(self):
        process = self.run_process(json.dumps(request()).encode() + b"\n")
        response = json.loads(process.stdout)
        validate_contract("AgentResponse", response)
        self.assertEqual(response["runId"], "run-1")
        self.assertEqual(response["exampleId"], "example-1")
        self.assertEqual(response["error"]["code"], "configuration")

    def test_reference_exclusion_in_actual_jsonl_process(self):
        process = self.run_process(json.dumps(request(expected={"secret_reference": "never"})).encode() + b"\n")
        response = json.loads(process.stdout)
        self.assertEqual(response["error"]["code"], "invalid_request")
        self.assertNotIn(b"secret_reference", process.stdout + process.stderr)

    def test_malformed_identity_still_returns_valid_failure(self):
        process = self.run_process(json.dumps(request(runId=" invalid ", exampleId=123)).encode() + b"\n")
        response = json.loads(process.stdout)
        validate_contract("AgentResponse", response)
        self.assertEqual(response["runId"], "invalid")
        self.assertEqual(response["error"]["code"], "invalid_request")

if __name__ == "__main__": unittest.main()
