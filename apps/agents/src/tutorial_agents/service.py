"""The generated AgentRequest is the only JSONL agent input envelope."""
import asyncio
import time
from pathlib import Path
from tutorial_contracts import validate_contract, sha256, canonical_json
from jsonschema import Draft7Validator
from tutorial_contracts.generated import AgentRequest, AgentResponse
from . import AGENT_VERSION
from .prepared import prepared_agent, DOMAINS
from .runtime import OperationFailure, contains_reference, infer, profile_from_env, read_documents

def source_hash():
    root = Path(__file__).parent
    files = sorted([*root.glob("*.py"), root / "domains.json"])
    return sha256(b"".join(path.name.encode() + b"\0" + path.read_bytes() for path in files))

async def invoke(request: AgentRequest, *, trace_id=None, client_factory=None) -> AgentResponse:
    started = time.monotonic()
    # Even malformed input gets a bounded correlated failure, never a fabricated score.
    run_id = request.get("runId", "invalid") if isinstance(request, dict) else "invalid"
    example_id = request.get("exampleId", "invalid") if isinstance(request, dict) else "invalid"
    identity = {"schemaVersion": "1.0.0", "runId": run_id, "exampleId": example_id, "status": "failed", "error": {"code": "invalid_request", "message": "Invalid request.", "retryable": False}}
    try:
        validate_contract("AgentFailure", identity)
    except Exception:
        run_id, example_id = "invalid", "invalid"
    try:
        try:
            validate_contract("AgentRequest", request)
            if contains_reference(request["input"]): raise ValueError()
            spec = prepared_agent(request["exerciseId"], request["agentVariant"])
            domain = DOMAINS[request["exerciseId"]]
            Draft7Validator(domain["inputSchema"]).validate(request["input"])
        except Exception:
            raise OperationFailure("invalid_request", "Invalid agent request, variant or reference material in input.") from None
        documents = read_documents(request["documents"])
        if request["exerciseId"] not in ("02-document-classification", "03-independent-tie-out") and request["documents"]:
            raise OperationFailure("invalid_request", "This prepared agent does not consume documents.")
        if request["exerciseId"] == "02-document-classification" and [doc["id"] for doc in request["documents"]] != [request["input"]["documentId"]]:
            raise OperationFailure("invalid_request", "Classification requires exactly its declared synthetic document.")
        if request["exerciseId"] == "03-independent-tie-out" and set(doc["id"] for doc in request["documents"]) != set(request["input"]["documentIds"]):
            raise OperationFailure("invalid_request", "Tie-out documents must match the declared synthetic document IDs.")
        kwargs = {"client_factory": client_factory} if client_factory else {}
        output, usage = await infer(profile_from_env(), spec, request["input"], 2048, request["deadlineMs"], documents, output_schema=domain["outputSchema"], **kwargs)
        try:
            Draft7Validator(domain["outputSchema"]).validate(output)
        except Exception:
            raise OperationFailure("agent_output_schema", "Agent output does not match the installed exercise schema.") from None
        result = {"schemaVersion": "1.0.0", "runId": run_id, "exampleId": example_id,
            "status": "completed", "output": output, "agentVersion": AGENT_VERSION,
            "sourceHash": source_hash(), "promptHash": sha256(spec.instructions + "\n" + canonical_json(domain["outputSchema"])),
            "durationMs": int((time.monotonic() - started) * 1000), "usage": usage}
        if trace_id: result["traceId"] = trace_id
        validate_contract("AgentResponse", result)
        return result
    except OperationFailure as error:
        detail = error.detail
    except asyncio.CancelledError:
        detail = {"code": "cancelled", "message": "Agent operation cancelled.", "retryable": False}
    except Exception:
        detail = {"code": "runtime_error", "message": "Prepared agent operation failed.", "retryable": False}
    return {"schemaVersion": "1.0.0", "runId": run_id, "exampleId": example_id, "status": "failed", "error": detail}
