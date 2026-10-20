"""Refresh displayed prepared prompts without changing datasets or learner code.

Uses only source-owned prompts and schemas; no provider calls or third-party
dependencies. Run after changing the prepared runtime or its prompts.
"""
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
AGENTS = ROOT.parent / "apps/agents/src/tutorial_agents"


def save(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=True) + "\n")


def sync():
    tutorial = json.loads((ROOT / "tutorial.json").read_text())
    module_spec = importlib.util.spec_from_file_location("prepared_for_consultation", AGENTS / "prepared.py")
    prepared = importlib.util.module_from_spec(module_spec)
    sys.modules[module_spec.name] = prepared
    module_spec.loader.exec_module(prepared)
    maf = (AGENTS / "maf.py").read_text()
    files = sorted([*AGENTS.glob("*.py"), AGENTS / "domains.json"])
    source_hash = sha256(b"".join(path.name.encode() + b"\0" + path.read_bytes() for path in files)).hexdigest()
    snapshot = {"sourceFile": "apps/agents/src/tutorial_agents/maf.py",
                "sourceFileHash": sha256(maf.encode()).hexdigest(), "sources": {}}
    for exercise in tutorial["exercises"]:
        consultation, hashes = maf, {}
        schema_json = json.dumps(exercise["outputSchema"], sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        for variant in exercise["agentVariants"]:
            prompt = prepared.prepared_agent(exercise["id"], variant).instructions
            consultation += f'\n# Installed exercise: {exercise["id"]}; variant: {variant}.\n'
            consultation += "# This exact primitive is called by runtime.infer under the host deadline.\n"
            consultation += "# Input and document bytes are supplied by the trusted supervisor.\n"
            consultation += "# Output schema is installed from the schema-only projection in domains.json.\n"
            consultation += "# Installed prompt:\n" + "".join(("# " + line if line else "#") + "\n" for line in prompt.splitlines())
            hashes[variant] = sha256((prompt + "\n" + schema_json).encode()).hexdigest()
        snapshot["sources"][exercise["id"]] = {
            "pythonSource": consultation, "sourceHash": source_hash,
            "promptHash": hashes[exercise["defaultAgentVariant"]], "promptHashes": hashes,
        }
        if exercise["id"] == "07-spec-regression":
            (ROOT / "exercises/07-spec-regression/agent_consultation.py").write_text(consultation)
            exercise["pythonSource"] = consultation
    save(ROOT / "consultation-sources.json", snapshot)
    save(ROOT / "tutorial.json", tutorial)
    print(f'Refreshed {len(snapshot["sources"])} prepared consultations; datasets and fixtures unchanged.')


if __name__ == "__main__":
    sync()
