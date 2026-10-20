"""Cross-runtime corpus validation using frozen Python contracts, no provider calls."""
import json
from pathlib import Path
from jsonschema import Draft7Validator
from tutorial_contracts import validate_contract, dataset_hash
root = Path(__file__).resolve().parents[1]
tutorial = json.loads((root / 'tutorial.json').read_text())
validate_contract('Tutorial', tutorial)
count = 0
for exercise in tutorial['exercises']:
    dataset = json.loads((root / f"datasets/{exercise['datasetId']}/{exercise['datasetVersion']}.json").read_text())
    validate_contract('Dataset', dataset)
    assert dataset_hash(dataset) == dataset['contentHash'] == exercise['datasetHash']
    validators = {key: Draft7Validator(exercise[key]) for key in ('inputSchema', 'outputSchema', 'expectedSchema')}
    for example in dataset['examples']:
        validators['inputSchema'].validate(example['input'])
        validators['expectedSchema'].validate(example['expected'])
        for fixture in example['fixtures']:
            validators['outputSchema'].validate(fixture['output'])
            count += 1
print(f'Python frozen-contract validation: eight datasets, {count} fixtures, all domain schemas and RFC 8785 hashes match TS')
assert len(tutorial['exercises']) == 8
assert count == 65
