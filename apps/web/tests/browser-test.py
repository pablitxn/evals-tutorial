"""Production-build browser rehearsal with synthetic, schema-checked v1 API data.
Run Vite preview at 127.0.0.1:4173 first. No real inference or Phoenix recording.
"""
import copy, hashlib, json, re, subprocess, sys, time
from pathlib import Path
from uuid import uuid4
from playwright.sync_api import sync_playwright, expect
from browser_harness import launch_browser, new_artifact_directory, revision, write_report

ROOT = Path(__file__).resolve().parents[3]
PROVENANCE = revision(ROOT)
ARTIFACTS = new_artifact_directory(ROOT)
MOCK = json.loads(subprocess.check_output(['node', '--import', 'tsx', 'apps/web/tests/mock-data.ts'], cwd=ROOT))
checks = []


def record_failure(error_type, error, traceback):
    report = {**PROVENANCE, 'mockOnly': True, 'status': 'failed', 'sandboxRequired': True,
              'checks': checks, 'failureType': error_type.__name__, 'reason': str(error),
              'liveProviderCalls': 0, 'livePhoenixArtifacts': 0}
    destination = write_report(ARTIFACTS, report)
    print(f'Browser rehearsal failed. Evidence: {destination}', file=sys.stderr)
    sys.__excepthook__(error_type, error, traceback)


sys.excepthook = record_failure

class Backend:
    def __init__(self):
        self.posts=[]; self.runs={}; self.reviews={}; self.hold=False; self.held_runs=set(); self.held_reviews=set()
        self.run_outcome='completed'; self.review_outcome='ready'; self.outage=False
        self.drop_submission=False; self.dropped=False; self.serial=0
    def route(self, route):
        req=route.request; path=req.url.split('/api/',1)[1]
        body=json.loads(req.post_data or '{}')
        if req.method=='POST': self.posts.append((path,body))
        def fulfill(data, status=200): route.fulfill(status=status,content_type='application/json',body=json.dumps(data))
        if path=='tutorial': return fulfill(MOCK['tutorial'])
        if path=='status':
            data=copy.deepcopy(MOCK['status'])
            if self.outage:
                for field in ['agents','judge','review']: data['capabilities'][field]={'available':False,'reason':'Synthetic provider outage'}
            return fulfill(data)
        if path.startswith('exercises/'):
            eid=path.split('/')[1]; data=copy.deepcopy(MOCK['dataset']); data['datasetId']='mock-'+eid
            return fulfill(data)
        if path=='validate':
            marker='SYNTAX_ERROR' if 'SYNTAX_ERROR' in body['source'] else 'TYPE_ERROR' if 'TYPE_ERROR' in body['source'] else None
            return fulfill({'codeHash':hashlib.sha256(body['source'].encode()).hexdigest(),'valid':not marker,'diagnostics': [{'file':'evaluator.ts','line':2,'column':3,'code':marker,'severity':'error','message':'Synthetic '+marker+' diagnostic'}] if marker else []})
        if path=='runs':
            existing=next((r for r in self.runs.values() if r['request']['requestId']==body['requestId']),None)
            if existing: return fulfill({'runId':existing['runId']},202)
            self.serial+=1; data=copy.deepcopy(MOCK['fixtures' if body['mode']=='fixtures' else 'agent'])
            data.update(runId=f'mock-run-{self.serial}', request=body, codeHash=hashlib.sha256(body['snapshot']['source'].encode()).hexdigest())
            data['provenance']['codeHash']=data['codeHash']
            if body['snapshot']['exerciseId']=='04-policy-recommendation': data['provenance']['provider']=MOCK['status']['provider']
            self.runs[data['runId']]=data
            if self.hold: self.held_runs.add(data['runId'])
            if self.drop_submission and not self.dropped: self.dropped=True; return route.abort('failed')
            return fulfill({'runId':data['runId']},202)
        if path.startswith('runs/'):
            rid=path.split('/')[1]
            if rid not in self.runs: return fulfill({'error':{'code':'not_found','message':'Synthetic backend restart lost this receipt','retryable':False}},404)
            data=copy.deepcopy(self.runs[rid])
            if path.endswith('/cancel'):
                self.runs[rid]['status']='cancelled'; data['status']='cancelled'
            elif self.hold and rid in self.held_runs and data['status']!='cancelled': data.update(status='running',rows=[],completedRows=0)
            elif self.run_outcome!='completed' and data['status']!='cancelled':
                data['status']=self.run_outcome; data['error']={'code':'timeout' if self.run_outcome=='timed_out' else 'runtime_error','message':'Synthetic operational failure','retryable':True}
                data['rows']=[{'exampleId':'example-1','status':'timed_out' if self.run_outcome=='timed_out' else 'failed','error':data['error']}]
                data['completedRows']=0
            return fulfill(data)
        if path=='reviews':
            self.serial+=1; data=copy.deepcopy(MOCK['review']); data.update(reviewId=f'mock-review-{self.serial}',requestId=body['requestId'],feedbackLocale=body.get('feedbackLocale','en'))
            fixture=self.runs[body['fixtureRunId']]; agent=self.runs[body['agentRunId']]
            data['binding'].update(body['snapshot']); data['binding'].pop('source')
            data['binding'].update(codeHash=body['codeHash'],fixtureRunId=fixture['runId'],agentRunId=agent['runId'],agentVariant=agent['request']['agentVariant'])
            self.reviews[data['reviewId']]=data
            if self.hold: self.held_reviews.add(data['reviewId'])
            return fulfill({'reviewId':data['reviewId']},202)
        if path.startswith('reviews/'):
            rid=path.split('/')[1]; data=copy.deepcopy(self.reviews[rid])
            if data['status']=='cancelled':
                data.pop('assessment',None); return fulfill(data)
            if path.endswith('/cancel'): self.reviews[rid]['status']='cancelled'; data.update(status='cancelled'); data.pop('assessment',None)
            elif self.hold and rid in self.held_reviews: data.update(status='running'); data.pop('assessment',None)
            elif self.review_outcome=='failed':
                data.update(status='failed',error={'code':'review_output_schema','message':'Synthetic malformed review','retryable':True}); data.pop('assessment',None)
            elif self.review_outcome in ['needs_changes','inconclusive']:
                data.update(status=self.review_outcome); data['assessment']={'status':self.review_outcome,'summary':'Synthetic specific feedback.','findings':[{'criterionId':'criterion','exampleIds':['example-1'],'evidence':'The negative fixture requires an independent label check.','feedback':'Keep the reference separate from the response.','nextAction':'Edit the label comparison and retest.'}]}
            return fulfill(data)
        return fulfill({'error':{'code':'not_found','message':'Synthetic route missing','retryable':False}},404)


class GuidedBackend(Backend):
    """Complete synthetic requirement receipts for comparison recovery checks."""
    def __init__(self):
        super().__init__()
        self.baseline_outcome = 'completed'
        self.reject_candidate = False
        self.dataset = copy.deepcopy(MOCK['dataset'])
        self.dataset['datasetId'] = 'mock-07-spec-regression'
        self.dataset['examples'] = [dict(copy.deepcopy(self.dataset['examples'][0]), id=f'guided-example-{index}') for index in range(1, 4)]

    def route(self, route):
        path = route.request.url.split('/api/', 1)[1]
        body = json.loads(route.request.post_data or '{}')
        if path == 'tutorial':
            tutorial = copy.deepcopy(MOCK['tutorial'])
            tutorial['exercises'][7]['criteria'] = [{'id': f'R{index}', 'description': f'Synthetic requirement {index}.', 'mode': 'Code'} for index in range(1, 7)]
            return route.fulfill(content_type='application/json', body=json.dumps(tutorial))
        if path == 'exercises/07-spec-regression/dataset':
            return route.fulfill(content_type='application/json', body=json.dumps(self.dataset))
        if path == 'runs' and body.get('agentVariant') == 'omit-fees' and self.reject_candidate:
            self.posts.append((path, body))
            return route.fulfill(status=503, content_type='application/json', body=json.dumps({'error': {'code': 'runtime_error', 'message': 'Synthetic definite candidate rejection', 'retryable': True}}))
        existing = set(self.runs)
        result = super().route(route)
        for run_id in self.runs.keys() - existing:
            run = self.runs[run_id]
            variant = run['request']['agentVariant']
            run['provenance'].update(agentSourceHash='e' * 64, promptHash=('b' if variant == 'baseline' else 'c') * 64)
            run['totalRows'] = run['completedRows'] = 3
            run['rows'] = []
            for example in self.dataset['examples']:
                criteria = [{'criterionId': f'R{index}', 'label': 'fail' if variant == 'omit-fees' and index == 3 else 'pass', 'score': 0 if variant == 'omit-fees' and index == 3 else 1, 'explanation': f'Synthetic requirement R{index} evidence.'} for index in range(1, 7)]
                run['rows'].append({'exampleId': example['id'], 'status': 'completed', 'output': {'synthetic': True}, 'evaluation': {'label': 'pass' if variant == 'baseline' else 'fail', 'score': 1 if variant == 'baseline' else 0, 'explanation': 'Synthetic guided comparison evidence.', 'criteria': criteria}})
            if variant == 'baseline' and self.baseline_outcome == 'failed':
                run.update(status='failed', rows=[], completedRows=0, error={'code': 'runtime_error', 'message': 'Synthetic failed baseline', 'retryable': True})
            elif variant == 'baseline' and self.baseline_outcome in ['partial', 'incomplete']:
                run['rows'].pop(); run['completedRows'] = 2
                if self.baseline_outcome == 'partial': run['status'] = 'partial'
        return result

def record(name): checks.append({'check':name,'result':'passed','evidence':'synthetic production-build UI; no live inference'})


def editor_for(page, label='Editable TypeScript evaluator'):
    editor = page.get_by_role('textbox', name=label, exact=True)
    expect(page.locator('#evaluator-source .code-editor')).to_have_attribute('data-editor-state', 'ready')
    expect(editor).to_be_visible()
    return editor


def replace_source(editor, source):
    editor.focus()
    editor.press('ControlOrMeta+A')
    editor.page.keyboard.insert_text(source)


def editor_source(editor):
    # Use the public copy action: CodeMirror virtualizes long documents, and
    # contenteditable textContent/input_value cannot establish exact source bytes.
    page = editor.page
    marker = 'browser-copy-pending-' + uuid4().hex
    page.evaluate('(value) => navigator.clipboard.writeText(value)', marker)
    page.get_by_role('button', name=re.compile(r'^(Copy evaluator|Copiar evaluador)$')).click()
    page.wait_for_function('(marker) => navigator.clipboard.readText().then(text => text !== marker)', arg=marker)
    return page.evaluate('navigator.clipboard.readText()')


def expect_source(editor, source):
    expect(editor).to_be_visible()
    assert editor_source(editor) == source


def preferences_language(page):
    page.get_by_role('button', name=re.compile(r'^(Open preferences|Abrir preferencias)$')).click()
    dialog = page.get_by_role('dialog', name=re.compile(r'^(Preferences|Preferencias)$'))
    expect(dialog).to_be_visible()
    dialog.get_by_role('button', name=re.compile(r'^(Language|Idioma)$'), exact=True).click()
    return dialog.get_by_role('combobox', name=re.compile(r'^(Language|Idioma)$'), exact=True)


def close_preferences(page):
    page.get_by_role('button', name=re.compile(r'^(Close preferences|Cerrar preferencias)$')).click()
    expect(page.get_by_role('dialog', name=re.compile(r'^(Preferences|Preferencias)$'))).not_to_be_visible()


def set_language(page, locale):
    choice = preferences_language(page)
    choice.click()
    page.get_by_role('option', name='Español' if locale == 'es' else 'English', exact=True).click()
    expect(page.locator('html')).to_have_attribute('lang', locale)
    close_preferences(page)


def expect_language(page, locale):
    expect(page.locator('html')).to_have_attribute('lang', locale)
    expect(preferences_language(page)).to_contain_text('Español' if locale == 'es' else 'English')
    close_preferences(page)


def select_lesson(page, exercise_id):
    menu = page.locator('details.lesson-menu')
    if not menu.get_attribute('open') == '':
        menu.locator('summary').click()
    page.locator(f'nav a[href="#{exercise_id}"]').click()


def guided_recovery_checks(browser, errors):
    post_count = 0
    def open_guided():
        context = browser.new_context(viewport={'width':1440,'height':1000}, reduced_motion='reduce')
        page = context.new_page(); backend = GuidedBackend()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('**/api/**', backend.route)
        page.goto('http://127.0.0.1:4173/#07-spec-regression')
        expect(page.get_by_role('button', name='Run baseline · 3 cases', exact=True)).to_be_enabled()
        return context, page, backend

    for outcome in ['cancelled', 'failed', 'partial', 'incomplete']:
        context, page, backend = open_guided()
        backend.baseline_outcome = outcome
        backend.hold = outcome == 'cancelled'
        page.get_by_role('button', name='Run baseline · 3 cases', exact=True).click()
        if outcome == 'cancelled':
            expect(page.get_by_role('button', name='Cancel', exact=True)).to_be_enabled()
            page.get_by_role('button', name='Cancel', exact=True).click()
        expect(page.get_by_role('button', name='Start new baseline attempt', exact=True)).to_be_enabled()
        expect(page.get_by_role('button', name='Run omit-fees · 3 cases', exact=True)).to_be_disabled()
        assert not any(body.get('agentVariant') == 'omit-fees' for path, body in backend.posts if path == 'runs')
        post_count += len(backend.posts); context.close()
    record('Cancelled, failed, partial and incomplete baselines keep the paid candidate disabled and allow a new baseline attempt')

    context, page, backend = open_guided()
    page.get_by_role('button', name='Run baseline · 3 cases', exact=True).click()
    candidate = page.get_by_role('button', name='Run omit-fees · 3 cases', exact=True)
    expect(candidate).to_be_enabled()
    baseline_id = next(iter(backend.runs))
    backend.reject_candidate = True; candidate.click()
    expect(page.get_by_role('alert')).to_contain_text('runtime_error: Synthetic definite candidate rejection')
    expect(candidate).to_be_enabled()
    rejected_id = backend.posts[-1][1]['requestId']
    backend.reject_candidate = False; candidate.click()
    expect(page.get_by_text('Regression: pass → fail', exact=True)).to_have_count(3)
    assert backend.posts[-1][1]['requestId'] != rejected_id
    assert list(backend.runs)[0] == baseline_id and len(backend.runs) == 2
    results = page.get_by_role('region', name='Requirement-linked comparison results')
    results.get_by_text('R3 · pass → fail', exact=True).first.click()
    results.get_by_role('link', name='Read requirement R3', exact=True).first.click()
    assert page.url.endswith('#07-spec-regression')
    for width in [1440,1024,390,320]:
        page.set_viewport_size({'width':width,'height':1000})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), width
        if width in [1440,390]:
            page.evaluate('window.scrollTo(0,0); document.activeElement.blur()')
            page.screenshot(path=str(ARTIFACTS/f'guided-comparison-{width}-ui-mock.png'),full_page=True)
    before = len(backend.posts); page.reload()
    expect(page.get_by_text('Regression: pass → fail', exact=True)).to_have_count(3)
    assert len(backend.posts) == before
    post_count += len(backend.posts); context.close()
    record('Definite candidate rejection preserves the completed baseline, permits explicit retry, and restores the finished comparison by GET only')
    record('Completed comparison exposes requirement links and fits 1440/1024/390/320 widths without document overflow')

    context, page, backend = open_guided()
    page.get_by_role('button', name='Run baseline · 3 cases', exact=True).click()
    candidate = page.get_by_role('button', name='Run omit-fees · 3 cases', exact=True)
    expect(candidate).to_be_enabled()
    backend.drop_submission = True; candidate.click()
    expect(page.get_by_role('button', name='Recover submission', exact=True)).to_be_visible()
    original_id = backend.posts[-1][1]['requestId']
    page.get_by_role('button', name='Recover submission', exact=True).click()
    expect(page.get_by_text('Regression: pass → fail', exact=True)).to_have_count(3)
    assert backend.posts[-1][1]['requestId'] == original_id and len(backend.runs) == 2
    post_count += len(backend.posts); context.close()
    record('Unknown candidate submission outcome retains same-ID recovery and never duplicates the accepted run')

    for missing_variant in ['baseline', 'omit-fees']:
        context, page, backend = open_guided()
        backend.hold = missing_variant == 'baseline'
        page.get_by_role('button', name='Run baseline · 3 cases', exact=True).click()
        if missing_variant == 'omit-fees':
            candidate = page.get_by_role('button', name='Run omit-fees · 3 cases', exact=True)
            expect(candidate).to_be_enabled(); backend.hold = True; candidate.click()
        expect(page.get_by_role('button', name='Cancel', exact=True)).to_be_enabled()
        expect(page.locator('.comparison-receipt').nth(0 if missing_variant == 'baseline' else 1).locator('.state-pill')).to_have_text('running')
        lost_id = next(reversed(backend.runs)); backend.runs.pop(lost_id)
        before = len(backend.posts)
        expect(page.get_by_text('The backend no longer has this accepted operation.', exact=False)).to_be_visible()
        expect(page.get_by_role('button', name='Start new baseline attempt', exact=True)).to_be_enabled()
        expect(page.get_by_role('button', name='Reset Tutorial', exact=True)).to_be_enabled()
        saved = page.evaluate("JSON.parse(localStorage.getItem('evals-tutorial:ui-mock-v1:07-spec-regression:1'))")
        assert saved.get('agentRunId') != lost_id
        assert saved.get('comparison', {}).get('baselineRunId') != lost_id
        assert saved.get('comparison', {}).get('candidateRunId') != lost_id
        page.reload()
        expect(page.get_by_role('button', name='Start new baseline attempt', exact=True)).to_be_enabled()
        expect(page.get_by_role('button', name='Reset Tutorial', exact=True)).to_be_enabled()
        assert len(backend.posts) == before
        post_count += len(backend.posts); context.close()
    record('Missing accepted baseline and candidate receipts clear all matching aliases and unlock new attempts without another POST')
    return post_count


with sync_playwright() as p:
    browser=launch_browser(p, ARTIFACTS, PROVENANCE)
    context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce',permissions=['clipboard-read','clipboard-write'])
    page=context.new_page(); backend=Backend(); errors=[]
    page.on('pageerror',lambda error: errors.append(str(error)))
    page.route('**/api/**',backend.route)
    page.goto('http://127.0.0.1:4173/')
    expect(page.get_by_role('heading',name='Introduction',exact=True)).to_be_visible()
    assert page.get_by_role('navigation',name='Tutorial lessons').get_by_role('link').count()==8
    expect(editor_for(page, 'Read-only TypeScript evaluator')).to_have_attribute('aria-readonly','true')
    for e in MOCK['tutorial']['exercises']: select_lesson(page, e['id'])
    assert not backend.posts; record('Eight destinations; read-only intro; navigation causes zero POSTs')
    guided_editor = editor_for(page, 'Read-only TypeScript evaluator')
    expect(guided_editor).to_have_attribute('aria-readonly', 'true')
    guided_editor.focus(); guided_editor.press('End'); page.keyboard.insert_text('// must not edit')
    expect_source(guided_editor, MOCK['tutorial']['exercises'][7]['starterSource'])
    expect(page.get_by_role('heading', name='2. Inspect the prepared derivation', exact=True)).to_be_visible()
    expect(page.get_by_role('region', name='Requirement to evaluator mapping').locator('tbody tr')).to_have_count(6)
    expect(page.get_by_role('button', name='Run baseline · 3 cases', exact=True)).to_be_enabled()
    expect(page.get_by_role('button', name='Run omit-fees · 3 cases', exact=True)).to_be_disabled()
    expect(page.get_by_role('button', name='Validate', exact=True)).to_have_count(0)
    expect(page.get_by_role('button', name='Reset Exercise', exact=True)).to_have_count(0)
    expect(page.get_by_role('heading', name='DOUBLE CHECK', exact=True)).to_have_count(0)
    assert not backend.posts
    record('Final guided example keeps fixed source read-only, exposes six requirements, gates candidate on baseline, and causes no automatic runs')
    # Locale is independent from work/progress; switching never issues a POST.
    before=len(backend.posts)
    set_language(page, 'es')
    expect_language(page, 'es')
    expect(page.locator('html')).to_have_attribute('lang','es')
    expect(page.get_by_role('navigation',name='Lecciones del tutorial')).to_be_visible()
    assert len(backend.posts)==before
    page.reload();expect_language(page, 'es')
    set_language(page, 'en')
    record('Accessible selector updates document language, persists on refresh, and issues no inference')

    select_lesson(page, '01-starred-classifier')
    editor=editor_for(page)
    replace_source(editor, MOCK['fixtures']['request']['snapshot']['source']+'// retained draft')
    select_lesson(page, '02-document-classification');page.go_back()
    expect_source(editor, MOCK['fixtures']['request']['snapshot']['source']+'// retained draft')
    page.reload();expect_source(editor, MOCK['fixtures']['request']['snapshot']['source']+'// retained draft')
    record('Draft survives navigation/back/refresh without inference')
    # Preserve exact bytes through the native drag/drop path, not only paste.
    original = 'first\nsecond\r\nthird\rfourth'
    editor.focus(); editor.press('ControlOrMeta+A')
    editor.evaluate("""(element, source) => {
        const data = new DataTransfer(); data.setData('text/plain', source);
        element.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data,bubbles:true,cancelable:true}));
    }""", original)
    expect_source(editor, original)
    editor.focus(); editor.press('ControlOrMeta+A'); editor.press('ArrowLeft'); editor.press('ArrowDown')
    editor.press('Shift+ArrowDown'); editor.press('Shift+ArrowDown')
    transfer = page.evaluate_handle('new DataTransfer()')
    editor.dispatch_event('dragstart', {'dataTransfer':transfer})
    assert transfer.evaluate("data => data.getData('Text')") == 'second\r\nthird\r'
    point = editor.locator('.cm-line').last.evaluate("""element => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let text; while (walker.nextNode()) text = walker.currentNode;
        const range = document.createRange(); range.setStart(text, text.textContent.length); range.collapse(true);
        const bounds = range.getBoundingClientRect();
        return {clientX:bounds.right,clientY:(bounds.top+bounds.bottom)/2};
    }""")
    editor.dispatch_event('drop', {'dataTransfer':transfer, **point})
    expect_source(editor, 'first\nfourthsecond\r\nthird\r')
    editor.focus(); editor.press('ControlOrMeta+z'); expect_source(editor, original)
    editor.focus(); editor.press('ControlOrMeta+Shift+z'); expect_source(editor, 'first\nfourthsecond\r\nthird\r')
    transfer.dispose()
    record('Native drag/drop and undo/redo preserve mixed CRLF/CR source bytes')
    replace_source(editor, 'export function evaluate() {\n  SYNTAX_ERROR\n}')
    page.get_by_role('button',name='Validate',exact=True).click()
    expect(page.get_by_role('button',name='SYNTAX_ERROR · line 2, column 3')).to_be_visible()
    page.get_by_role('button',name='SYNTAX_ERROR · line 2, column 3').click();expect(editor).to_be_focused()
    replace_source(editor, 'export function evaluate() {\n  TYPE_ERROR\n}')
    page.get_by_role('button',name='Validate',exact=True).click()
    expect(page.get_by_role('button',name='TYPE_ERROR · line 2, column 3')).to_be_visible()
    assert not any(path=='runs' for path,_ in backend.posts);record('Syntax/type positions focus source; validation causes no run')
    replace_source(editor, MOCK['fixtures']['request']['snapshot']['source']);page.get_by_role('button',name='Validate',exact=True).click()
    expect(page.get_by_role('status').get_by_text('Current source validated.', exact=True)).to_be_visible()
    page.get_by_role('button',name='Test Fixtures',exact=True).click()
    expect(page.get_by_role('cell',name='Matched',exact=True)).to_have_count(2)
    expect(page.get_by_text('fail / 0',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Run Agent',exact=True)).to_be_enabled()
    record('Known bad response fail/0 passes fixture assertion independently')
    page.get_by_role('button',name='Run Agent',exact=True).click()
    expect(page.get_by_text('The evaluator correctly detected the wrong label.', exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='DOUBLE CHECK',exact=True)).to_be_enabled()
    assert not page.get_by_role('link',name='Actual experiment').count();record('Agent criterion failure can be reviewed; absent Phoenix links stay unavailable')
    page.get_by_role('button',name='DOUBLE CHECK',exact=True).click()
    expect(page.locator('.review-panel').get_by_text('Reviewed — current version',exact=True)).to_be_visible()
    before=len(backend.posts); page.reload();expect(page.locator('.review-panel').get_by_text('Reviewed — current version',exact=True)).to_be_visible()
    assert len(backend.posts)==before;record('Current bound review restores by GET after refresh; no duplicate paid request')
    old_source=editor_source(editor); old_receipts=copy.deepcopy(backend.reviews)
    before=len(backend.posts)
    set_language(page, 'es')
    expect_source(editor_for(page, 'Evaluador TypeScript editable'), old_source)
    expect(page.locator('.review-panel').get_by_text('Revisado — versión actual',exact=True)).to_be_visible()
    expect(page.locator('.review-panel').get_by_text('Synthetic review: the known mistake was distinguished.',exact=True)).to_be_visible()
    expect(page.locator('.review-panel').get_by_text('Idioma solicitado para los comentarios: Inglés.',exact=False)).to_be_visible()
    assert backend.reviews==old_receipts and len(backend.posts)==before
    page.reload()
    expect(page.locator('.review-panel').get_by_text('Revisado — versión actual',exact=True)).to_be_visible()
    expect_source(editor_for(page, 'Evaluador TypeScript editable'), old_source)
    assert len(backend.posts)==before
    # Only the explicit new review captures Spanish; its English mock feedback remains honest.
    page.get_by_role('button',name='Validar',exact=True).click()
    expect(page.get_by_role('button',name='Revisar de nuevo',exact=True)).to_be_enabled()
    page.get_by_role('button',name='Revisar de nuevo',exact=True).click()
    expect(page.locator('.review-panel').get_by_text('Idioma solicitado para los comentarios: Español.',exact=False)).to_be_visible()
    assert backend.posts[-1][0]=='reviews' and backend.posts[-1][1]['feedbackLocale']=='es'
    expect(page.locator('.review-panel').get_by_text('Synthetic review: the known mistake was distinguished.',exact=True)).to_be_visible()
    set_language(page, 'en')
    expect_source(editor, old_source)
    record('Language switch preserves source, validation, run evidence, progress and original feedback; only explicit review requests capture locale')

    replace_source(editor, MOCK['fixtures']['request']['snapshot']['source']+'// new version')
    expect(page.locator('.review-panel').get_by_text('Previous review is stale',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Review Again',exact=True)).to_be_disabled();record('Edit immediately invalidates review and evidence')
    # Source copy retained; current receipts re-created before retry scenarios.
    page.get_by_role('button',name='Validate',exact=True).click();expect(page.get_by_role('status').get_by_text('Current source validated.', exact=True)).to_be_visible()
    page.get_by_role('button',name='Test Fixtures',exact=True).click();expect(page.get_by_role('button',name='Run Agent',exact=True)).to_be_enabled()
    page.get_by_role('button',name='Run Agent',exact=True).click();expect(page.get_by_role('button',name='Review Again',exact=True)).to_be_enabled()
    backend.review_outcome='failed';page.get_by_role('button',name='Review Again',exact=True).click()
    expect(page.locator('.review-panel').get_by_text('Review unavailable',exact=True)).to_be_visible();expect(page.get_by_role('button',name='Retry Review',exact=True)).to_be_enabled()
    backend.review_outcome='needs_changes';page.get_by_role('button',name='Retry Review',exact=True).click()
    expect(page.locator('.review-panel').get_by_text('Needs revision',exact=True)).to_be_visible();expect(page.locator('.review-panel').get_by_text('Edit the label comparison and retest.')).to_be_visible()
    backend.review_outcome='inconclusive';page.get_by_role('button',name='Review Again',exact=True).click();expect(page.locator('.review-panel').get_by_text('Review inconclusive',exact=True)).to_be_visible()
    record('Review operational retry, specific criterion/row feedback, and inconclusive status')
    backend.hold=True;page.get_by_role('button',name='Retry Review',exact=True).click()
    expect(page.get_by_role('button',name='Cancel Review',exact=True)).to_be_enabled()
    page.get_by_role('button',name='Cancel Review',exact=True).click();expect(page.locator('.review-panel').get_by_text('Review cancelled',exact=True)).to_be_visible()
    backend.hold=False;record('Review cancellation retains a cancelled receipt and never grants completion')
    backend.hold=True;page.get_by_role('button',name='Test Fixtures',exact=True).click()
    expect(page.get_by_role('button',name='Cancel',exact=True)).to_be_enabled()
    assert editor.is_editable() is False
    before=len(backend.posts);page.reload();expect(page.get_by_role('button',name='Cancel',exact=True)).to_be_enabled();assert len(backend.posts)==before
    page.get_by_role('button',name='Cancel',exact=True).click();expect(page.get_by_text('cancelled',exact=True).first).to_be_visible()
    backend.hold=False;record('Active run locks mutation; refresh GET-only recovery; cancellation retains receipt')
    backend.hold=True;page.get_by_role('button',name='Test Fixtures',exact=True).click()
    expect(page.get_by_role('button',name='Cancel',exact=True)).to_be_enabled()
    backend.runs.pop(next(reversed(backend.runs)))
    page.reload();expect(page.get_by_text('The backend no longer has this accepted operation.',exact=False)).to_be_visible()
    expect(page.get_by_role('button',name='Reset Exercise',exact=True)).to_be_enabled();backend.hold=False
    record('Definitively missing accepted receipt after backend restart removes completion and unlocks local recovery')
    backend.run_outcome='timed_out';page.get_by_role('button',name='Test Fixtures',exact=True).click();expect(page.get_by_text('timeout: Synthetic operational failure').first).to_be_visible()
    backend.run_outcome='failed';page.get_by_role('button',name='Test Fixtures',exact=True).click();expect(page.get_by_text('runtime_error: Synthetic operational failure').first).to_be_visible()
    record('Timeout/runtime errors are displayed without invented scores')
    backend.run_outcome='completed';backend.drop_submission=True;page.get_by_role('button',name='Test Fixtures',exact=True).click()
    expect(page.get_by_role('button',name='Recover submission',exact=True)).to_be_visible()
    first=backend.posts[-1][1]['requestId'];page.get_by_role('button',name='Recover submission',exact=True).click();expect(page.get_by_role('button',name='Run Agent',exact=True)).to_be_enabled()
    assert backend.posts[-1][1]['requestId']==first;record('Lost accepted response recovery reuses original idempotent request ID')
    backend.outage=True;before=len(backend.posts);page.reload();expect(editor_for(page)).to_be_visible();assert len(backend.posts)==before
    expect(page.get_by_role('button',name='Run Agent',exact=True)).to_be_disabled();expect(page.get_by_role('button',name='Test Fixtures',exact=True)).to_be_enabled();record('Provider outage leaves healthy Code fixtures usable and prevents paid action')
    page.evaluate("localStorage.setItem('another-application', 'keep')")
    old=editor_source(editor);page.get_by_role('button',name='Reset Exercise',exact=True).click();expect(page.get_by_role('dialog')).to_be_visible();expect(page.get_by_role('button',name='Cancel',exact=True)).to_be_focused()
    page.get_by_role('button',name='Cancel',exact=True).click();expect_source(editor, old)
    page.get_by_role('button',name='Reset Exercise',exact=True).click();page.get_by_role('dialog').get_by_role('button',name='Reset Exercise',exact=True).click()
    expect_source(editor, MOCK['fixtures']['request']['snapshot']['source']);assert page.evaluate("localStorage.getItem('another-application')")=='keep';record('Reset cancel/confirm scopes local work and preserves unrelated storage')
    backend.outage=False;page.reload();select_lesson(page, '04-policy-recommendation')
    expect(page.get_by_text('Fixtures use judge tokens. Agent runs use agent + judge tokens. No inference on navigation.')).to_be_visible()
    page.get_by_role('tab',name='Python agent',exact=True).click();expect(page.locator('#python-panel')).to_be_visible()
    page.get_by_role('tab',name='Python agent',exact=True).press('ArrowLeft');expect(page.get_by_role('tab',name='Dataset JSON',exact=True)).to_be_focused()
    editor.focus();editor.press('Tab');assert not editor.evaluate('(el)=>el===document.activeElement');record('Mixed per-criterion badges/cost; reference keyboard tabs; editor Tab escape')
    page.evaluate('window.scrollTo(0,0); document.activeElement.blur()')
    page.screenshot(path=str(ARTIFACTS/'desktop-ui-mock.png'),full_page=True)
    for width in [1024,390,320]:
        page.set_viewport_size({'width':width,'height':1000});page.reload();expect(page.get_by_role('heading',name='Policy support',exact=True)).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),width
        page.get_by_role('textbox',name='Editable TypeScript evaluator').focus();page.get_by_role('textbox',name='Editable TypeScript evaluator').press('Tab')
        if width==390:
            page.evaluate('window.scrollTo(0,0); document.activeElement.blur()')
            page.screenshot(path=str(ARTIFACTS/'narrow-ui-mock.png'),full_page=True)
    record('1024/390/320 layouts avoid document overflow and allow editor keyboard escape')
    set_language(page, 'es')
    for width in [1440,1024,390,320]:
        page.set_viewport_size({'width':width,'height':1000});page.reload()
        expect_language(page, 'es')
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),width
        page.get_by_role('textbox',name='Evaluador TypeScript editable').focus()
        page.get_by_role('textbox',name='Evaluador TypeScript editable').press('Tab')
        if width in [1440,390]:
            page.evaluate('window.scrollTo(0,0); document.activeElement.blur()')
            page.screenshot(path=str(ARTIFACTS/f'spanish-{width}-ui-mock.png'),full_page=True)
    record('Spanish labels and long help text fit 1440/1024/390/320 widths with keyboard editor escape')
    set_language(page, 'en')

    page.set_viewport_size({'width':720,'height':700});page.evaluate("document.documentElement.style.fontSize='200%'")
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth');record('200% font zoom with narrow viewport keeps page width bounded')
    old_context=browser.new_context(viewport={'width':390,'height':900},permissions=['clipboard-read','clipboard-write'])
    old_page=old_context.new_page();old_page.route('**/api/**',backend.route)
    old_page.add_init_script("localStorage.setItem('evals-tutorial:old:01-starred-classifier:old', JSON.stringify({source:'old evaluator source'}));")
    old_page.goto('http://127.0.0.1:4173/#01-starred-classifier')
    expect(old_page.get_by_text('Saved work belongs to an older version.',exact=True)).to_be_visible()
    expect_source(editor_for(old_page), MOCK['fixtures']['request']['snapshot']['source'])
    old_context.close();record('Changed content version retains inspectable old source without inheriting progress')
    # Use the actual credential-free lesson corpus for all eight localized descriptions.
    actual=json.loads((ROOT/'content/tutorial.json').read_text())
    actual_documents=json.loads((ROOT/'content/documents/tax-demo-v1/manifest.json').read_text())['documents']
    actual_context=browser.new_context(viewport={'width':390,'height':900},locale='es-AR',permissions=['clipboard-read','clipboard-write'])
    actual_page=actual_context.new_page()
    def actual_route(route):
        path = route.request.url.split('/api/', 1)[1]
        if path == 'tutorial':
            route.fulfill(content_type='application/json',body=json.dumps(actual))
        elif path.startswith('exercises/') and path.endswith('/dataset'):
            exercise = next(exercise for exercise in actual['exercises'] if exercise['id'] == path.split('/')[1])
            dataset_path = ROOT/'content/datasets'/exercise['datasetId']/f"{exercise['datasetVersion']}.json"
            route.fulfill(content_type='application/json', body=dataset_path.read_text())
        elif path.startswith('documents/'):
            document = next(document for document in actual_documents if document['id'] == path.split('/')[1])
            route.fulfill(content_type=document['mimeType'], body=(ROOT/'content'/document['path']).read_bytes())
        else: backend.route(route)
    actual_page.route('**/api/**',actual_route)
    before=len(backend.posts)
    actual_page.goto('http://127.0.0.1:4173/')
    expect_language(actual_page, 'es')
    translations=json.loads((ROOT/'apps/web/src/locales/lessons.es.json').read_text())
    for exercise in actual['exercises']:
        select_lesson(actual_page, exercise['id'])
        expect(actual_page.get_by_role('heading',name=translations[exercise['id']]['title'],exact=True)).to_be_visible()
        expect_source(editor_for(actual_page, 'Evaluador TypeScript de solo lectura' if exercise['readOnly'] else 'Evaluador TypeScript editable'), exercise['starterSource'])
        expect(actual_page.locator('#dataset-panel').get_by_role('tree')).to_be_visible()
        expect(actual_page.get_by_role('alert')).to_have_count(0)
        assert actual_page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    for locale in ['es', 'en']:
        set_language(actual_page, locale)
        for width in [1440,1024,390,320]:
            actual_page.set_viewport_size({'width':width,'height':1000})
            actual_page.reload()
            expect(actual_page.get_by_role('heading', name=translations['07-spec-regression']['title'] if locale == 'es' else actual['exercises'][7]['title'], exact=True)).to_be_visible()
            expect(editor_for(actual_page, 'Evaluador TypeScript de solo lectura' if locale == 'es' else 'Read-only TypeScript evaluator')).to_have_attribute('aria-readonly', 'true')
            expect(actual_page.locator('#dataset-panel').get_by_role('tree')).to_be_visible()
            expect(actual_page.get_by_role('alert')).to_have_count(0)
            assert actual_page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), (locale, width)
            if width in [1440,390]:
                actual_page.evaluate('window.scrollTo(0,0); document.activeElement.blur()')
                actual_page.screenshot(path=str(ARTIFACTS/f'guided-{locale}-{width}-ui-mock.png'),full_page=True)
    assert len(backend.posts)==before
    actual_context.close()
    record('Spanish browser preference selects all eight actual translated lessons with unchanged starter code and zero POSTs')
    record('Final guided example fits English and Spanish 1440/1024/390/320 layouts with fixed source and zero POSTs')

    blocked_context=browser.new_context(viewport={'width':390,'height':900},permissions=['clipboard-read','clipboard-write'])
    blocked_page=blocked_context.new_page();blocked_page.route('**/api/**',backend.route)
    blocked_page.add_init_script("Storage.prototype.setItem = function(){throw new Error('Synthetic full storage')};")
    blocked_page.goto('http://127.0.0.1:4173/#01-starred-classifier')
    replace_source(editor_for(blocked_page), 'retained in-memory work')
    expect(blocked_page.get_by_text('Edits are not saved in this browser.',exact=False)).to_be_visible()
    expect_source(editor_for(blocked_page), 'retained in-memory work')
    blocked_context.close();record('Storage failure stays visible and preserves in-memory edits with copy control')
    guided_posts = guided_recovery_checks(browser, errors)
    assert not errors,errors
    record('Production bundle runs without browser page errors')
    report={**PROVENANCE,'mockOnly':True,'status':'passed','sandboxRequired':True,'browser':browser.version,'checks':checks,'postCount':len(backend.posts)+guided_posts,'liveProviderCalls':0,'livePhoenixArtifacts':0}
    write_report(ARTIFACTS, report)
    print(json.dumps(report,indent=2))
    browser.close()
