"""MAF request-shape probe using an in-memory HTTP transport, not inference."""
import asyncio
import base64
import importlib.metadata as metadata
import inspect
import json
import os
from pathlib import Path
import httpx2
from openai import AsyncOpenAI
from pydantic import BaseModel
from agent_framework import Agent, Content, Message
from agent_framework.openai import OpenAIChatClient, OpenAIChatCompletionClient

if os.environ.get('ET_TRACEPARENT'):
    from agent_framework.observability import configure_otel_providers
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry import context, propagate, trace
    configure_otel_providers(service_name='et-wp-00-maf-mock',
        resource_attributes={'openinference.project.name':os.environ['ET_TRACE_PROJECT']},
        exporters=[OTLPSpanExporter(endpoint='http://127.0.0.1:16006/v1/traces',timeout=5)],
        enable_sensitive_data=True,enable_console_exporters=False)
    trace_token = context.attach(propagate.extract({'traceparent':os.environ['ET_TRACEPARENT']}))

class Result(BaseModel):
    label: str

async def main():
    requests = []
    def handle(request):
        body = json.loads(request.content)
        requests.append({'url':str(request.url),'path':request.url.path,'body':body})
        return httpx2.Response(200, json={
            'id':'resp_synthetic','object':'response','created_at':1,
            'model':'offline-probe-model','status':'completed',
            'output':[{'type':'message','id':'msg_synthetic','role':'assistant',
                       'status':'completed','content':[{'type':'output_text',
                       'text':'{"label":"synthetic"}','annotations':[]}]}],
            'usage':{'input_tokens':1,'output_tokens':1,'total_tokens':2}})
    # Literal noncredential required by the SDK; no network is possible with MockTransport.
    transport = httpx2.MockTransport(handle)
    async with httpx2.AsyncClient(transport=transport) as http:
        sdk = AsyncOpenAI(api_key='offline-placeholder',http_client=http,max_retries=0)
        client = OpenAIChatClient(model='offline-probe-model',async_client=sdk)
        agent = Agent(client=client,name='SyntheticProbe',instructions='Return a label.')
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0ioAAAAASUVORK5CYII=')
        pdf = b'%PDF-1.4\n% Synthetic request-shape placeholder, not a perception test.\n%%EOF'
        for mime,data in [('image/png',png),('application/pdf',pdf)]:
            msg = Message(role='user',contents=[Content.from_text('Synthetic probe.'),Content.from_data(data,mime)])
            response = await agent.run(msg,options={'response_format':Result,'max_tokens':32})
            assert response.value.label == 'synthetic'
            content = requests[-1]['body']['input'][-1]['content']
            assert any(c['type'] == ('input_image' if mime=='image/png' else 'input_file') for c in content)
            assert requests[-1]['body']['max_output_tokens'] == 32
            assert requests[-1]['body']['text']['format']['type'] == 'json_schema'
    # Constructor routing checks do not send requests.
    azure = OpenAIChatClient(model='offline-deployment',azure_endpoint='https://synthetic.openai.azure.com',api_key='offline-placeholder',api_version='2025-04-01-preview')
    azure_v1 = OpenAIChatClient(model='offline-deployment',base_url='https://synthetic.openai.azure.com/openai/v1',api_key='offline-placeholder')
    async with httpx2.AsyncClient(transport=transport) as http:
        for routed in [azure,azure_v1]:
            mocked = routed.client.with_options(http_client=http,max_retries=0)
            routed_agent = Agent(client=OpenAIChatClient(model='offline-deployment',async_client=mocked))
            for mime,data in [('image/png',png),('application/pdf',pdf)]:
                msg = Message(role='user',contents=[Content.from_text('Synthetic Azure request probe.'),Content.from_data(data,mime)])
                response = await routed_agent.run(msg,options={'response_format':Result,'max_tokens':32})
                assert response.value.label == 'synthetic'
                assert requests[-1]['body']['model'] == 'offline-deployment'
                assert requests[-1]['url'].startswith('https://synthetic.openai.azure.com/openai/v1/responses')
    missing = None
    try:
        OpenAIChatClient(model='offline-probe-model')
    except Exception as error:
        missing = {'type':type(error).__name__,'message':str(error)}
    assert missing, 'Missing credentials did not fail at construction'
    versions = {p:metadata.version(p) for p in ['agent-framework-core','agent-framework-openai','openai','pydantic','opentelemetry-api','opentelemetry-sdk']}
    print(json.dumps({'mode':'in-memory-mock; no inference; no live format support claimed',
        'versions':versions,'requests':requests,'missingConfig':missing,
        'azureResourceBaseUrl':str(azure.client.base_url),
        'azureV1BaseUrl':str(azure_v1.client.base_url),
        'azureResourceQuery':dict(azure.client.default_query),
        'azureV1Query':dict(azure_v1.client.default_query),
        'responsesSignature':str(inspect.signature(OpenAIChatClient)),
        'chatCompletionsSignature':str(inspect.signature(OpenAIChatCompletionClient))},indent=2))

if __name__ == '__main__':
    try:
        asyncio.run(main())
    finally:
        if os.environ.get('ET_TRACEPARENT'):
            context.detach(trace_token)
            trace.get_tracer_provider().force_flush(timeout_millis=5000)
            trace.get_tracer_provider().shutdown()
