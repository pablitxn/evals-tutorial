"""Append the final guided example without rewriting the original seven exercises.

Run from the repository root, then run finalize.ts for canonical dataset hashes.
No provider calls, inference results or document regeneration occur here.
"""
from copy import deepcopy
from hashlib import sha256
from pathlib import Path
import importlib.util
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
VERSION = '1.0.0'
EXERCISE_ID = '07-spec-regression'
DIRECTORY = ROOT / 'exercises' / EXERCISE_ID
REQUIREMENTS = [
    ('R1', 'A recommendation identifies exactly one supplied catalog option on the requested route.'),
    ('R2', 'Both option and response dates equal the request, with return after outbound.'),
    ('R3', 'Report the exact fare plus mandatory fees in the requested currency and integer cents.'),
    ('R4', 'The selected full catalog total and reported total are at or below budget; equality is allowed.'),
    ('R5', 'Return no_options iff no eligible option exists, with all four itinerary fields null; otherwise recommend.'),
    ('R6', 'Always return simulated true and booked false; no booking capability exists.'),
]

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=True) + '\n')


def option(identifier, fare, fees):
    return {'id': identifier, 'origin': 'AAA', 'destination': 'BBB',
            'departDate': '2027-03-10', 'returnDate': '2027-03-13',
            'fareCents': fare, 'feesCents': fees, 'currency': 'USD'}


def response(selected=None, total=None):
    return {'status': 'recommendation' if selected else 'no_options',
            'optionId': selected, 'departDate': '2027-03-10' if selected else None,
            'returnDate': '2027-03-13' if selected else None, 'totalCents': total,
            'currency': 'USD', 'simulated': True, 'booked': False}


def fixture(identifier, output, passed, criterion, explanation, row_id):
    return {'id': identifier, 'output': output, 'expectedEvaluation': {
        'allowedLabels': ['pass' if passed else 'fail'], 'minScore': 1 if passed else 0,
        'maxScore': 1 if passed else 0, 'requiredEvidence': [criterion, row_id]},
        'rationale': explanation}


def build():
    tutorial = json.loads((ROOT / 'tutorial.json').read_text())
    travel = next(item for item in tutorial['exercises'] if item['id'] == '06-simulated-travel')
    rows = []
    # Explicit independent references; do not derive expected values from evaluator code.
    for row_id, title, budget, catalog, eligible, totals, good, regression in [
        ('spec-routine', 'Routine trip within budget', 40000,
         [option('FL-ROUTINE', 28000, 3000)], ['FL-ROUTINE'], {'FL-ROUTINE': 31000},
         response('FL-ROUTINE', 31000), None),
        ('spec-fare-choice', 'Affordable fare versus high mandatory fees', 32000,
         [option('FL-AFFORDABLE', 27000, 3000), option('FL-HIGH-FEES', 24000, 12000)],
         ['FL-AFFORDABLE'], {'FL-AFFORDABLE': 30000, 'FL-HIGH-FEES': 36000},
         response('FL-AFFORDABLE', 30000), response('FL-HIGH-FEES', 24000)),
        ('spec-no-affordable', 'No affordable option', 30000,
         [option('FL-OVER-BUDGET', 28000, 7000)], [], {'FL-OVER-BUDGET': 35000},
         response(), response('FL-OVER-BUDGET', 28000)),
    ]:
        expected = {'eligibleOptionIds': eligible, 'totalsCents': totals,
                    'status': 'recommendation' if eligible else 'no_options'}
        expected_by_requirement = {
            'R1': 'Recommend one supplied option on route AAA to BBB, or return justified no_options.',
            'R2': 'Use 2027-03-10 outbound and 2027-03-13 return for any recommendation.',
            'R3': 'Currency USD; full totals in cents: ' + ', '.join(f'{key}={value}' for key, value in totals.items()) + '.',
            'R4': f'Any recommended full total must be <= {budget} cents.',
            'R5': 'Eligible IDs: ' + (', '.join(eligible) if eligible else 'none') + '; require ' + expected['status'] + (' with four null itinerary fields.' if not eligible else ' with a complete itinerary.'),
            'R6': 'simulated=true; booked=false.',
        }
        row = {'id': row_id, 'input': {'origin': 'AAA', 'destination': 'BBB',
               'departDate': '2027-03-10', 'returnDate': '2027-03-13',
               'budgetCents': budget, 'currency': 'USD', 'options': catalog},
               'expected': expected, 'metadata': {'synthetic': True,
               'referenceAuthor': 'Project-authored before inference', 'fixtureVersion': VERSION,
               'title': title, 'requirementIds': [key for key, _ in REQUIREMENTS],
               'expectedByRequirement': expected_by_requirement}, 'fixtures': [fixture(
                   row_id + '-good', good, True, 'R5' if not eligible else 'R3',
                   'Author-created semantic fixture satisfying R1-R6; not a provider run.', row_id)]}
        if regression:
            row['fixtures'].append(fixture(row_id + '-omitted-fees', regression, False, 'R3',
                'Author-created fee omission fixture; hidden mandatory fees exceed the budget. Not a provider run.', row_id))
        rows.append(row)
    dataset = {'schemaVersion': VERSION, 'datasetId': EXERCISE_ID + '-v1',
               'datasetVersion': VERSION, 'examples': rows,
               'documentManifestRef': None, 'contentHash': '0' * 64}
    dataset_path = ROOT / f'datasets/{dataset["datasetId"]}/{VERSION}.json'
    # Preserve a previously finalized identity when its complete preimage is unchanged.
    if dataset_path.exists():
        previous = json.loads(dataset_path.read_text())
        if {**previous, 'contentHash': '0' * 64} == dataset:
            dataset['contentHash'] = previous['contentHash']
    save(dataset_path, dataset)
    criteria = [{'id': key, 'description': description, 'mode': 'Code'} for key, description in REQUIREMENTS]
    exercise = {'id': EXERCISE_ID, 'title': 'Specification-driven regression example',
                'exerciseVersion': VERSION, 'rubricVersion': VERSION, 'mode': 'Code', 'readOnly': True,
                'lessonMarkdown': (DIRECTORY / 'lesson.md').read_text().rstrip('\n'),
                'starterSource': (DIRECTORY / 'starter.ts').read_text(), 'pythonSource': '',
                'datasetId': dataset['datasetId'], 'datasetVersion': VERSION,
                'datasetHash': dataset['contentHash'], 'criteria': criteria,
                'agentVariants': ['baseline', 'omit-fees'], 'defaultAgentVariant': 'baseline',
                'maxJudgeCallsPerRow': 0, 'officialDocs': deepcopy(travel['officialDocs'])}
    for key in ('inputSchema', 'outputSchema', 'expectedSchema'):
        exercise[key] = deepcopy(travel[key])
    tutorial['exercises'] = [item for item in tutorial['exercises'] if item['id'] != EXERCISE_ID] + [exercise]
    save(DIRECTORY / 'rubric.json', {'version': VERSION, 'criteria': criteria, 'fixtureVersion': VERSION})
    (DIRECTORY / 'agent-instructions.md').write_text(
        'Prepared-agent instructions for integration\n\nSpecification-driven regression example\n\n'
        + '\n'.join(key + ': ' + description for key, description in REQUIREMENTS)
        + '\n\nBaseline reuses the simulated-travel prompt. The deliberately regressing omit-fees variant ignores fees in totals and eligibility and selects the lowest base fare. Both use the real provider runtime and this same dataset. The exact installed prompts and MAF call are shown in agent_consultation.py. No expected references, fixture outputs or evaluator source enter an agent request. No booking.\n')
    # Schema-only projection: no expected records, references, lessons or fixtures.
    agent_root = REPO / 'apps/agents/src/tutorial_agents'
    projection_path = agent_root / 'domains.json'
    projection = json.loads(projection_path.read_text())
    projection['exercises'][EXERCISE_ID] = {key: exercise[key] for key in ('inputSchema', 'outputSchema')}
    save(projection_path, projection)
    # Import only the source-owned prompts; this module performs no provider calls.
    module_spec = importlib.util.spec_from_file_location('prepared_for_authoring', agent_root / 'prepared.py')
    prepared = importlib.util.module_from_spec(module_spec)
    sys.modules[module_spec.name] = prepared
    module_spec.loader.exec_module(prepared)
    maf = (agent_root / 'maf.py').read_text()
    snapshot_path = ROOT / 'consultation-sources.json'
    snapshot = json.loads(snapshot_path.read_text())
    source_files = sorted([*agent_root.glob('*.py'), agent_root / 'domains.json'])
    source_hash = sha256(b''.join(path.name.encode() + b'\0' + path.read_bytes() for path in source_files)).hexdigest()
    for source in snapshot['sources'].values():
        source['sourceHash'] = source_hash
    consultation = maf
    for variant in exercise['agentVariants']:
        prompt = prepared.prepared_agent(EXERCISE_ID, variant).instructions
        consultation += f'\n# Installed exercise: {EXERCISE_ID}; variant: {variant}.\n'
        consultation += '# This exact primitive is called by runtime.infer under the host deadline.\n'
        consultation += '# Input and document bytes are supplied by the trusted supervisor.\n'
        consultation += '# Output schema is installed from the schema-only projection in domains.json.\n'
        consultation += '# Installed prompt:\n' + ''.join('# ' + line + '\n' for line in prompt.splitlines())
    schema_json = json.dumps(exercise['outputSchema'], sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    prompt_hashes = {variant: sha256((prepared.prepared_agent(EXERCISE_ID, variant).instructions + '\n' + schema_json).encode()).hexdigest()
                     for variant in exercise['agentVariants']}
    snapshot['sources'][EXERCISE_ID] = {'pythonSource': consultation, 'sourceHash': source_hash,
        'promptHash': prompt_hashes['baseline'], 'promptHashes': prompt_hashes}
    snapshot['sourceFileHash'] = sha256((agent_root / 'maf.py').read_bytes()).hexdigest()
    save(snapshot_path, snapshot)
    (DIRECTORY / 'agent_consultation.py').write_text(consultation)
    exercise['pythonSource'] = consultation
    save(ROOT / 'tutorial.json', tutorial)
    print('Appended one guided SDD exercise, one three-case dataset and five explicit fixtures; no inference. Run finalize.ts for canonical hashes.')


if __name__ == '__main__':
    build()
