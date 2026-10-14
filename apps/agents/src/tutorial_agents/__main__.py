"""One request, one response; stdout is protocol only."""
import asyncio
import json
import sys
from tutorial_contracts import validate_contract
from .runtime import OperationFailure, strict_json, tracing
from .service import invoke

MAX_PROTOCOL_BYTES = 1048576

def read_request():
    raw = sys.stdin.buffer.readline(MAX_PROTOCOL_BYTES + 1)
    if len(raw) > MAX_PROTOCOL_BYTES or not raw.endswith(b"\n"):
        raise OperationFailure("protocol_error", "Expected one bounded JSONL request.")
    if sys.stdin.buffer.read(1):
        raise OperationFailure("protocol_error", "Only one request is accepted per process.")
    try:
        return strict_json(raw.decode("utf-8"))
    except (ValueError, UnicodeError):
        raise OperationFailure("protocol_error", "Invalid JSONL request.") from None

def write_response(response):
    raw = json.dumps(response, ensure_ascii=True, allow_nan=False, separators=(",", ":"))
    if len(raw.encode()) + 1 > MAX_PROTOCOL_BYTES:
        raise OperationFailure("resource_limit", "Response exceeds protocol limit.")
    sys.stdout.write(raw + "\n")

def main():
    request = None
    try:
        request = read_request()
        try:
            validate_contract("AgentRequest", request)
        except Exception:
            write_response(asyncio.run(invoke(request)))
            return
        with tracing(request) as trace_id:
            response = asyncio.run(invoke(request, trace_id=trace_id))
        write_response(response)
    except OperationFailure as error:
        response = {"schemaVersion": "1.0.0", "runId": "invalid", "exampleId": "invalid", "status": "failed", "error": error.detail}
        write_response(response)
    except Exception:
        # Missing SDKs/configuration cannot masquerade as successful inference.
        write_response({"schemaVersion": "1.0.0", "runId": "invalid", "exampleId": "invalid", "status": "failed", "error": {"code": "runtime_error", "message": "Prepared agent process failed.", "retryable": False}})

if __name__ == "__main__":
    main()
