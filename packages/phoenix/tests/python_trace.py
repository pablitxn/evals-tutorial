"""Owned synthetic Node/Python continuity probe. No model or provider request."""
import os
from opentelemetry import context, propagate, trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.resources import Resource
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

provider = TracerProvider(resource=Resource.create({
    "openinference.project.name": os.environ["ET_TRACE_PROJECT"],
    "service.name": "et-wp07-synthetic-python",
}))
provider.add_span_processor(SimpleSpanProcessor(OTLPSpanExporter(
    endpoint="http://127.0.0.1:6006/v1/traces", timeout=5,
)))
trace.set_tracer_provider(provider)
token = context.attach(propagate.extract({"traceparent": os.environ["ET_TRACEPARENT"]}))
try:
    tracer = trace.get_tracer("et-wp07-continuity")
    with tracer.start_as_current_span("Synthetic Python agent", attributes={
        "openinference.span.kind": "AGENT",
    }):
        with tracer.start_as_current_span("Synthetic model boundary; no inference", attributes={
            "openinference.span.kind": "LLM",
        }):
            pass
finally:
    context.detach(token)
    if not provider.force_flush(timeout_millis=5000):
        raise RuntimeError("Synthetic exporter flush timed out")
    provider.shutdown()
