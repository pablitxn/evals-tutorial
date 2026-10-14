"""Shared explicit provider routing, bounded inference and sanitized failures."""
import asyncio
import json
import os
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse
from agent_framework import Content
from agent_framework.openai import OpenAIChatClient
from agent_framework.observability import configure_otel_providers
from opentelemetry import context, propagate, trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from tutorial_contracts import canonical_json, sha256
from .maf import run_message

class OperationFailure(Exception):
    def __init__(self, code: str, message: str, retryable: bool = False):
        self.detail = {"code": code, "message": message, "retryable": retryable}
        super().__init__(message)

@dataclass(frozen=True)
class Profile:
    provider: str
    model: str
    key: str = field(repr=False)
    endpoint: str | None = None
    api_version: str | None = None

def profile_from_env(env=None) -> Profile:
    env = os.environ if env is None else env
    provider, model, key = (env.get(k) for k in ("TUTORIAL_PROVIDER", "TUTORIAL_MODEL", "TUTORIAL_API_KEY"))
    if provider not in ("openai", "azure_foundry") or not model or len(model) > 256 or not key:
        raise OperationFailure("configuration", "An explicit global tutorial provider, model and backend key are required.")
    endpoint, version = env.get("TUTORIAL_AZURE_ENDPOINT"), env.get("TUTORIAL_API_VERSION")
    if provider == "azure_foundry":
        url = urlparse(endpoint or "")
        if url.scheme != "https" or not (url.hostname or "").endswith(".openai.azure.com") or url.username or url.password or url.port or url.path not in ("", "/") or url.query or url.fragment or not version:
            raise OperationFailure("configuration", "Azure requires a key-based resource endpoint and explicit API version; project endpoints are unsupported.")
    elif endpoint or version:
        raise OperationFailure("configuration", "OpenAI profile cannot contain Azure routing fields.")
    return Profile(provider, model, key, endpoint, version)

def make_client(profile: Profile, timeout_seconds: float, http_client=None):
    # No ambient OPENAI_/AZURE_ settings are passed by the host. All routing is explicit.
    kwargs = {"model": profile.model, "api_key": profile.key}
    if profile.provider == "azure_foundry":
        kwargs.update(azure_endpoint=profile.endpoint, api_version=profile.api_version)
    else:
        kwargs["base_url"] = "https://api.openai.com/v1"
    routed = OpenAIChatClient(**kwargs)
    options = {"max_retries": 0, "timeout": timeout_seconds}
    if http_client is not None:
        options["http_client"] = http_client
    sdk = routed.client.with_options(**options)
    return OpenAIChatClient(model=profile.model, async_client=sdk)

def strict_json(text: str):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("Duplicate JSON field")
            result[key] = value
        return result
    def constant(_):
        raise ValueError("Nonfinite JSON number")
    value = json.loads(text, object_pairs_hook=pairs, parse_constant=constant)
    canonical_json(value)
    return value

def contains_reference(value) -> bool:
    if isinstance(value, list):
        return any(contains_reference(item) for item in value)
    if isinstance(value, dict):
        return any(key in {"expected", "fixtures", "source", "starterSource", "pythonSource", "expectedEvaluation"} or contains_reference(item) for key, item in value.items())
    return False

def read_documents(documents):
    if len(documents) > 8:
        raise OperationFailure("resource_limit", "At most eight synthetic pages are supported.")
    result, total, ids = [], 0, set()
    for document in documents:
        if document["id"] in ids:
            raise OperationFailure("invalid_request", "Duplicate document ID.")
        ids.add(document["id"])
        if document["mimeType"] not in ("image/png", "image/jpeg"):
            raise OperationFailure("unsupported_media", "PDF perception is not enabled; supply synthetic PNG/JPEG pages.")
        path = Path(document["absolutePath"])
        if not path.is_absolute() or not path.is_file() or path.is_symlink():
            raise OperationFailure("invalid_request", "Expected a resolved regular document file.")
        if path.stat().st_size > 4 * 1024 * 1024:
            raise OperationFailure("resource_limit", "Document exceeds byte limit.")
        # Bounded read also covers files changed after stat.
        with path.open("rb") as handle:
            data = handle.read(4 * 1024 * 1024 + 1)
        total += len(data)
        if len(data) > 4 * 1024 * 1024 or total > 8 * 1024 * 1024:
            raise OperationFailure("resource_limit", "Document set exceeds byte limit.")
        if sha256(data) != document["sha256"]:
            raise OperationFailure("invalid_request", "Document digest differs from the verified manifest.")
        if document["mimeType"] == "image/png" and not data.startswith(b"\x89PNG\r\n\x1a\n") or document["mimeType"] == "image/jpeg" and not data.startswith(b"\xff\xd8\xff"):
            raise OperationFailure("unsupported_media", "Document bytes do not match the declared MIME.")
        result.extend([Content.from_text("Synthetic document ID: " + document["id"]), Content.from_data(data, document["mimeType"])])
    return result

async def infer(profile, spec, material, max_tokens, deadline_ms, documents=(), response_model=None, output_schema=None, client_factory=make_client):
    if not isinstance(deadline_ms, int) or not 1 <= deadline_ms <= 60000 or not isinstance(max_tokens, int) or not 1 <= max_tokens <= 2048:
        raise OperationFailure("invalid_request", "Invalid provider deadline or output-token bound.")
    client = client_factory(profile, deadline_ms / 1000)
    try:
        async with asyncio.timeout(deadline_ms / 1000):
            response = await run_message(client, spec, material, documents, max_tokens, response_model, output_schema)
        if any(c.additional_properties.get("model_output_kind") == "refusal" for m in response.messages for c in m.contents):
            raise OperationFailure("provider_refusal", "The selected provider refused this request.")
        try:
            # Inspect the SDK's parsed value, then preserve raw JSON types for the
            # frozen validator (Pydantic coercion must not repair malformed data).
            if response_model and response.value is None:
                raise ValueError("Missing parsed structured value")
            value = strict_json(response.text)
            if not isinstance(value, dict):
                raise ValueError("Expected an object")
        except (ValueError, TypeError, AttributeError):
            raise OperationFailure("agent_output_schema", "Provider output was not a valid structured JSON object.") from None
        usage = response.usage_details or {}
        return value, {dst: usage[src] for src, dst in (("input_token_count", "inputTokens"), ("output_token_count", "outputTokens")) if isinstance(usage.get(src), int) and usage[src] >= 0}
    except OperationFailure:
        raise
    except TimeoutError:
        raise OperationFailure("timeout", "Provider deadline expired.") from None
    except asyncio.CancelledError:
        raise
    except Exception as error:
        # MAF wraps SDK/parsing failures; classify the exception chain without
        # reading or returning messages, headers or credential-bearing fields.
        names = set()
        current = error
        for _ in range(8):
            if not isinstance(current, BaseException): break
            names.add(type(current).__name__)
            current = current.__cause__ or getattr(current, "inner_exception", None)
        # Raw SDK errors may include headers, key fragments, prompts and endpoint details.
        if names & {"APITimeoutError", "ReadTimeout", "ConnectTimeout"}:
            raise OperationFailure("timeout", "Provider request timed out.") from None
        if names & {"ValidationError", "ChatClientInvalidResponseException", "JSONDecodeError"}:
            raise OperationFailure("agent_output_schema", "Provider returned an invalid structured result.") from None
        if names & {"OpenAIContentFilterException"}:
            raise OperationFailure("provider_refusal", "The selected provider refused this request.") from None
        raise OperationFailure("provider_unavailable", "Selected provider request failed.", True) from None
    finally:
        await client.client.close()

@contextmanager
def tracing(request):
    exporters = []
    endpoint = os.environ.get("TUTORIAL_TRACE_ENDPOINT")
    if endpoint:
        url = urlparse(endpoint)
        if url.scheme != "http" or url.hostname != "127.0.0.1" or url.path != "/v1/traces" or url.username or url.password or url.query or url.fragment:
            raise OperationFailure("configuration", "Telemetry requires a trusted loopback collector.")
        exporters.append(OTLPSpanExporter(endpoint=endpoint, timeout=2))
    configure_otel_providers(service_name="tutorial-agents", exporters=exporters,
        resource_attributes={"openinference.project.name": os.environ.get("TUTORIAL_TRACE_PROJECT", "tutorial-agents")},
        enable_sensitive_data=False, enable_console_exporters=False)
    carrier = {key: request[key] for key in ("traceparent", "tracestate") if key in request}
    token = context.attach(propagate.extract(carrier))
    try:
        with trace.get_tracer("tutorial-agents").start_as_current_span("tutorial.agent") as span:
            span.set_attribute("tutorial.run_id", request["runId"])
            span.set_attribute("tutorial.example_id", request["exampleId"])
            yield format(span.get_span_context().trace_id, "032x")
    finally:
        context.detach(token)
        provider = trace.get_tracer_provider()
        if hasattr(provider, "force_flush"):
            provider.force_flush(timeout_millis=2000)
