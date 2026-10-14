"""Actual MAF call shared by prepared agents, judges and educational reviewers."""
from agent_framework import Agent, Content, Message
from tutorial_contracts import canonical_json

async def run_message(client, spec, material, documents, max_tokens, response_model=None, output_schema=None):
    # The caller supplies only input and verified synthetic bytes for agents.
    # Judge/reviewer material is a separate trusted host operation; no tools exist.
    agent = Agent(client=client, name=spec.name, instructions=spec.instructions)
    response_format = response_model or (
        {"type": "json_schema", "json_schema": {
            "name": "tutorial_agent_output", "schema": output_schema, "strict": True,
        }} if output_schema else {"type": "json_object"}
    )
    message = Message(role="user", contents=[Content.from_text(canonical_json(material)), *documents])
    return await agent.run(message, options={
        "response_format": response_format,
        "max_tokens": max_tokens,
        "store": False,
    })
