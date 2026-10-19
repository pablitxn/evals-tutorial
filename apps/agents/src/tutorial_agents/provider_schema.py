"""Provider-only projection; installed domain schemas remain authoritative."""
from copy import deepcopy


def provider_output_schema(schema: dict) -> dict:
    """Copy an installed output schema for strict OpenAI/Azure structured output.

    These providers reject ``uniqueItems``. Omit it only in schema positions,
    never in property names or literal enum/const data. The raw model output
    still must pass the unchanged domain validator in service.invoke; this
    projection must never be used to validate accepted agent responses.
    """
    result = deepcopy(schema)

    def project(node):
        if not isinstance(node, dict):
            return
        node.pop("uniqueItems", None)
        for keyword in ("properties", "$defs", "definitions", "patternProperties", "dependentSchemas"):
            for child in node.get(keyword, {}).values():
                project(child)
        for keyword in ("anyOf", "allOf", "oneOf", "prefixItems"):
            for child in node.get(keyword, []):
                project(child)
        for keyword in ("items", "additionalItems", "additionalProperties", "contains", "not", "if", "then", "else"):
            child = node.get(keyword)
            if isinstance(child, list):
                for item in child:
                    project(item)
            else:
                project(child)

    project(result)
    return result
