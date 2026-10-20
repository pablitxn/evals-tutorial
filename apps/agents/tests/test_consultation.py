"""Displayed prompts must match the actual runtime, not an older source snapshot."""
import json
from pathlib import Path
import unittest

from tutorial_agents.prepared import DOMAINS, prepared_agent
from tutorial_agents.service import source_hash
from tutorial_contracts import canonical_json, sha256


class ConsultationTests(unittest.TestCase):
    def test_every_installed_variant_matches_displayed_prompt_and_provenance(self):
        root = Path(__file__).resolve().parents[3]
        tutorial = json.loads((root / "content/tutorial.json").read_text())
        snapshot = json.loads((root / "content/consultation-sources.json").read_text())
        maf = (root / snapshot["sourceFile"]).read_text()
        runtime_hash = source_hash()
        self.assertEqual(set(snapshot["sources"]), {item["id"] for item in tutorial["exercises"]})
        self.assertEqual(snapshot["sourceFileHash"], sha256(maf))
        for exercise in tutorial["exercises"]:
            with self.subTest(exercise=exercise["id"]):
                source = snapshot["sources"][exercise["id"]]
                self.assertTrue(source["pythonSource"].startswith(maf))
                self.assertEqual(source["sourceHash"], runtime_hash)
                self.assertEqual(set(source["promptHashes"]), set(exercise["agentVariants"]))
                self.assertEqual(source["promptHash"], source["promptHashes"][exercise["defaultAgentVariant"]])
                for variant in exercise["agentVariants"]:
                    prompt = prepared_agent(exercise["id"], variant).instructions
                    shown_prompt = "".join(("# " + line if line else "#") + "\n" for line in prompt.splitlines())
                    self.assertIn(shown_prompt, source["pythonSource"])
                    expected = sha256(prompt + "\n" + canonical_json(DOMAINS[exercise["id"]]["outputSchema"]))
                    self.assertEqual(source["promptHashes"][variant], expected)


if __name__ == "__main__":
    unittest.main()
