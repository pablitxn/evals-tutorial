"""Offline review-schema wire coverage. No real provider requests are possible."""
import json
import unittest
import test_agents
from tutorial_agents.broker import review_output_schema
from tutorial_agents.runtime import OperationFailure


def request(quotes=None):
    catalog = quotes if quotes is not None else [
        {"kind": "source", "quote": "return actual === expected;", "exampleIds": []},
        {"kind": "evaluation", "quote": "classification mismatch", "exampleIds": ["example-1"]},
    ]
    catalog = [{"id": f"quote-{index + 1}", **entry} for index, entry in enumerate(catalog)]
    return {"role": "review", "material": {"trustedSystem": "Use exact original-language evidence. Write feedback in Spanish.",
        "evidence": {"source": "const actual = row.output.label;\r\nreturn actual === expected;", "evidenceQuotes": catalog}},
        "maxOutputTokens": 2048, "deadlineMs": 1000}


def assessment(quote_id="quote-1"):
    return {"status": "ready", "summary": "This review is fallible.", "findings": [{"criterionId": "classification", "exampleIds": ["example-1"],
        "evidenceQuoteId": quote_id, "feedback": "Inspect the saved comparison.", "nextAction": "Retest the boundary example."}]}


class ReviewQuoteTests(unittest.IsolatedAsyncioTestCase):
    run_mock = test_agents.SDKTests.run_mock

    def test_quote_whitespace_matches_host_ecmascript_trim(self):
        for character in ("\u0085", "\u001c", "\u001d", "\u001e", "\u001f"):
            quote = "// abcd" + character
            schema, choices = review_output_schema(request([{"kind": "source", "quote": quote, "exampleIds": []}])["material"]["evidence"])
            self.assertEqual(choices, {"quote-1": quote})
            self.assertEqual(schema["$defs"]["ReviewFindingProjection"]["properties"]["evidenceQuoteId"]["enum"], ["quote-1"])
        for character in ("\ufeff", "\u00a0", "\u2028", "\u2029"):
            with self.assertRaises(OperationFailure):
                review_output_schema(request([{"kind": "source", "quote": "// abcd" + character, "exampleIds": []}])["material"]["evidence"])

    async def test_exact_quote_choices_reach_both_provider_schemas_without_rewriting_material(self):
        for provider in ("openai", "azure_foundry"):
            payload = request()
            output, calls = await self.run_mock(payload, text=json.dumps(assessment()), broker=True, provider=provider)
            self.assertIn("result", output)
            self.assertEqual(output["result"]["findings"][0]["evidence"], payload["material"]["evidence"]["evidenceQuotes"][0]["quote"])
            self.assertNotIn("evidenceQuoteId", output["result"]["findings"][0])
            self.assertEqual(len(calls), 1)
            body = calls[0][1]
            self.assertEqual(body["max_output_tokens"], 2048)
            self.assertFalse(body.get("tools"))
            response_schema = body["text"]["format"]["schema"]
            fields = response_schema["$defs"]["ReviewFindingProjection"]["properties"]
            self.assertNotIn("evidence", fields)
            self.assertEqual(fields["evidenceQuoteId"]["enum"], [entry["id"] for entry in payload["material"]["evidence"]["evidenceQuotes"]])
            self.assertTrue(body["text"]["format"]["strict"])
            user = body["input"][-1]["content"][0]["text"]
            self.assertEqual(json.loads(user), payload["material"]["evidence"])

    async def test_unknown_or_literal_quote_ids_fail_without_automatic_retry(self):
        for quote_id in ("quote-99", "return expected === actual;", "return actual === expected;", " quote-1", 1):
            output, calls = await self.run_mock(request(), text=json.dumps(assessment(quote_id)), broker=True)
            self.assertEqual(output["error"]["code"], "review_output_schema")
            self.assertEqual(len(calls), 1)
            self.assertNotIn("result", output)

    async def test_private_projection_rejects_missing_ids_and_supplied_public_evidence(self):
        missing = assessment()
        del missing["findings"][0]["evidenceQuoteId"]
        public = assessment()
        public["findings"][0]["evidence"] = "return actual === expected;"
        for value in (missing, public):
            output, calls = await self.run_mock(request(), text=json.dumps(value), broker=True)
            self.assertEqual(output["error"]["code"], "review_output_schema")
            self.assertEqual(len(calls), 1)

    async def test_unsupported_enum_literal_characters_remain_only_in_user_evidence_and_resolve_exactly(self):
        quote = 'const text = "a\\b"; // 😀\u0085'
        payload = request([{"kind": "source", "quote": quote, "exampleIds": []}])
        output, calls = await self.run_mock(payload, text=json.dumps(assessment()), broker=True)
        self.assertEqual(output["result"]["findings"][0]["evidence"], quote)
        schema = calls[0][1]["text"]["format"]["schema"]
        self.assertNotIn(quote, json.dumps(schema, ensure_ascii=False))
        self.assertEqual(schema["$defs"]["ReviewFindingProjection"]["properties"]["evidenceQuoteId"]["enum"], ["quote-1"])

    async def test_quote_enum_does_not_replace_full_review_contract_validation(self):
        value = assessment()
        del value["findings"][0]["feedback"]
        output, calls = await self.run_mock(request(), text=json.dumps(value), broker=True)
        self.assertEqual(output["error"]["code"], "review_output_schema")
        self.assertEqual(len(calls), 1)

    async def test_catalog_limits_fail_before_inference(self):
        malformed = [[], [{"kind": "source", "quote": "x" * 241, "exampleIds": []}],
            [{"kind": "source", "quote": "same quoted source", "exampleIds": []}] * 241,
            [{"kind": "source", "quote": "😀" * 240, "exampleIds": []}] * 100,
            [{"kind": "output", "quote": "long enough text", "exampleIds": []}],
            [{"kind": "source", "quote": "long enough text", "exampleIds": ["not-source"]}]]
        for catalog in malformed:
            output, calls = await self.run_mock(request(catalog), text=json.dumps(assessment()), broker=True)
            self.assertIn(output["error"]["code"], ("invalid_request", "resource_limit"))
            self.assertEqual(calls, [])
        payload = request()
        del payload["material"]["evidence"]["evidenceQuotes"]
        output, calls = await self.run_mock(payload, broker=True)
        self.assertEqual(output["error"]["code"], "invalid_request")
        self.assertEqual(calls, [])
        for bad_id in ("quote-2", 'quote-"1', 1):
            payload = request()
            payload["material"]["evidence"]["evidenceQuotes"][0]["id"] = bad_id
            output, calls = await self.run_mock(payload, broker=True)
            self.assertEqual(output["error"]["code"], "invalid_request")
            self.assertEqual(calls, [])

    async def test_maximum_catalog_remains_within_provider_enum_limits(self):
        catalog = [{"kind": "source", "quote": f"{index:03}:" + "x" * 236, "exampleIds": []} for index in range(240)]
        output, calls = await self.run_mock(request(catalog), text=json.dumps(assessment("quote-240")), broker=True)
        self.assertIn("result", output)
        schema = calls[0][1]["text"]["format"]["schema"]
        ids = schema["$defs"]["ReviewFindingProjection"]["properties"]["evidenceQuoteId"]["enum"]
        self.assertEqual(len(ids), 240)
        self.assertTrue(all(value.isascii() and '"' not in value for value in ids))
        self.assertLess(len(ids) + len(schema["properties"]["status"]["enum"]), 1000)
        self.assertLess(len(json.dumps(schema)), 120000)


if __name__ == "__main__":
    unittest.main()
