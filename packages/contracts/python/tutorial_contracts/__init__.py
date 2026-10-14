"""Runtime contracts: the shared JSON Schema remains the sole authority."""
import hashlib
import json
import math
from pathlib import Path
import rfc8785
from jsonschema import Draft7Validator
SCHEMA_PATH = Path(__file__).resolve().parents[2] / 'schema' / 'v1.json'
SCHEMA = json.loads(SCHEMA_PATH.read_text())

def validate_contract(name: str, value: object) -> None:
    def finite(item):
        if isinstance(item,float) and not math.isfinite(item):raise ValueError('Non-finite JSON number')
        if isinstance(item,dict):
            for child in item.values():finite(child)
        if isinstance(item,list):
            for child in item:finite(child)
    finite(value)
    Draft7Validator({'$ref': '#/$defs/' + name, '$defs': SCHEMA['$defs']}).validate(value)

def canonical_json(value: object) -> str:
    def portable(item):
        if isinstance(item,(int,float)) and not isinstance(item,bool) and (not math.isfinite(item) or abs(item)>9007199254740991):raise ValueError('JSON number outside portable finite range')
        if isinstance(item,dict):
            for child in item.values():portable(child)
        if isinstance(item,list):
            for child in item:portable(child)
    portable(value)
    return rfc8785.dumps(value).decode('utf-8')

def sha256(value: str | bytes) -> str:
    return hashlib.sha256(value.encode('utf-8') if isinstance(value,str) else value).hexdigest()

def dataset_hash(dataset: dict) -> str:
    return sha256(canonical_json({k:v for k,v in dataset.items() if k!='contentHash'}))
