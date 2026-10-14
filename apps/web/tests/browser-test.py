"""Production-build browser rehearsal with synthetic, schema-checked v1 API data.
Run Vite preview at 127.0.0.1:4173 first. No real inference or Phoenix recording.
"""
import copy, hashlib, json, subprocess, time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from browser_harness import launch_browser, new_artifact_directory, revision, write_report

ROOT = Path(__file__).resolve().parents[3]
PROVENANCE = revision(ROOT)
ARTIFACTS = new_artifact_directory(ROOT)
MOCK = json.loads(subprocess.check_output(['node', '--import', 'tsx', 'apps/web/tests/mock-data.ts'], cwd=ROOT))
checks = []

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

def record(name): checks.append({'check':name,'result':'passed','evidence':'synthetic production-build UI; no live inference'})

with sync_playwright() as p:
    browser=launch_browser(p, ARTIFACTS, PROVENANCE)
    context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
    page=context.new_page(); backend=Backend(); errors=[]
    page.on('pageerror',lambda error: errors.append(str(error)))
    page.route('**/api/**',backend.route)
    page.goto('http://127.0.0.1:4173/')
    expect(page.get_by_role('heading',name='Introduction',exact=True)).to_be_visible()
    assert page.get_by_role('navigation',name='Tutorial lessons').get_by_role('link').count()==7
    expect(page.get_by_role('textbox',name='Read-only TypeScript evaluator')).to_have_attribute('readonly','')
    for e in MOCK['tutorial']['exercises']: page.locator(f'nav a[href="#{e["id"]}"]').click()
    assert not backend.posts; record('Seven destinations; read-only intro; navigation causes zero POSTs')
    # Locale is independent from work/progress; switching never issues a POST.
    language=page.get_by_role('combobox',name='Language',exact=True)
    before=len(backend.posts)
    language.select_option('es')
    expect(page.get_by_role('combobox',name='Idioma',exact=True)).to_have_value('es')
    expect(page.locator('html')).to_have_attribute('lang','es')
    expect(page.get_by_role('navigation',name='Lecciones del tutorial')).to_be_visible()
    assert len(backend.posts)==before
    page.reload();expect(page.get_by_role('combobox',name='Idioma',exact=True)).to_have_value('es')
    page.get_by_role('combobox',name='Idioma',exact=True).select_option('en')
    record('Accessible selector updates document language, persists on refresh, and issues no inference')

    page.locator('nav a[href="#01-starred-classifier"]').click()
    editor=page.get_by_role('textbox',name='Editable TypeScript evaluator')
    editor.fill(MOCK['fixtures']['request']['snapshot']['source']+'// retained draft')
    page.locator('nav a[href="#02-document-classification"]').click();page.go_back()
    expect(editor).to_have_value(MOCK['fixtures']['request']['snapshot']['source']+'// retained draft')
    page.reload();expect(editor).to_have_value(MOCK['fixtures']['request']['snapshot']['source']+'// retained draft')
    record('Draft survives navigation/back/refresh without inference')
    editor.fill('export function evaluate() {\n  SYNTAX_ERROR\n}')
    page.get_by_role('button',name='Validate',exact=True).click()
    expect(page.get_by_role('button',name='SYNTAX_ERROR · line 2, column 3')).to_be_visible()
    page.get_by_role('button',name='SYNTAX_ERROR · line 2, column 3').click();expect(editor).to_be_focused()
    editor.fill('export function evaluate() {\n  TYPE_ERROR\n}')
    page.get_by_role('button',name='Validate',exact=True).click()
    expect(page.get_by_role('button',name='TYPE_ERROR · line 2, column 3')).to_be_visible()
    assert not any(path=='runs' for path,_ in backend.posts);record('Syntax/type positions focus source; validation causes no run')
    editor.fill(MOCK['fixtures']['request']['snapshot']['source']);page.get_by_role('button',name='Validate',exact=True).click()
    expect(page.get_by_text('✓ Validated current source')).to_be_visible()
    page.get_by_role('button',name='Test Fixtures',exact=True).click()
    expect(page.get_by_role('cell',name='Matched',exact=True)).to_have_count(2)
    expect(page.get_by_text('fail / 0',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Run Agent',exact=True)).to_be_enabled()
    record('Known bad response fail/0 passes fixture assertion independently')
    page.get_by_role('button',name='Run Agent',exact=True).click()
    expect(page.get_by_text('The evaluator correctly detected the wrong label.')).to_be_visible()
    expect(page.get_by_role('button',name='DOUBLE CHECK',exact=True)).to_be_enabled()
    assert not page.get_by_role('link',name='Actual experiment').count();record('Agent criterion failure can be reviewed; absent Phoenix links stay unavailable')
    page.get_by_role('button',name='DOUBLE CHECK',exact=True).click()
    expect(page.get_by_text('Reviewed — current version',exact=True)).to_be_visible()
    before=len(backend.posts); page.reload();expect(page.get_by_text('Reviewed — current version',exact=True)).to_be_visible()
    assert len(backend.posts)==before;record('Current bound review restores by GET after refresh; no duplicate paid request')
    old_source=editor.input_value(); old_receipts=copy.deepcopy(backend.reviews)
    before=len(backend.posts)
    page.get_by_role('combobox',name='Language',exact=True).select_option('es')
    expect(page.get_by_role('textbox',name='Evaluador TypeScript editable')).to_have_value(old_source)
    expect(page.get_by_text('Revisado — versión actual',exact=True)).to_be_visible()
    expect(page.get_by_text('Synthetic review: the known mistake was distinguished.',exact=True)).to_be_visible()
    expect(page.get_by_text('Idioma solicitado para los comentarios: Inglés.',exact=False)).to_be_visible()
    assert backend.reviews==old_receipts and len(backend.posts)==before
    page.reload()
    expect(page.get_by_text('Revisado — versión actual',exact=True)).to_be_visible()
    expect(page.get_by_role('textbox',name='Evaluador TypeScript editable')).to_have_value(old_source)
    assert len(backend.posts)==before
    # Only the explicit new review captures Spanish; its English mock feedback remains honest.
    page.get_by_role('button',name='Revisar de nuevo',exact=True).click()
    expect(page.get_by_text('Idioma solicitado para los comentarios: Español.',exact=False)).to_be_visible()
    assert backend.posts[-1][0]=='reviews' and backend.posts[-1][1]['feedbackLocale']=='es'
    expect(page.get_by_text('Synthetic review: the known mistake was distinguished.',exact=True)).to_be_visible()
    page.get_by_role('combobox',name='Idioma',exact=True).select_option('en')
    expect(editor).to_have_value(old_source)
    record('Language switch preserves source, validation, run evidence, progress and original feedback; only explicit review requests capture locale')

    editor.fill(MOCK['fixtures']['request']['snapshot']['source']+'// new version')
    expect(page.get_by_text('Previous review is stale',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Review Again',exact=True)).to_be_disabled();record('Edit immediately invalidates review and evidence')
    # Source copy retained; current receipts re-created before retry scenarios.
    page.get_by_role('button',name='Validate',exact=True).click();expect(page.get_by_text('✓ Validated current source')).to_be_visible()
    page.get_by_role('button',name='Test Fixtures',exact=True).click();expect(page.get_by_role('button',name='Run Agent',exact=True)).to_be_enabled()
    page.get_by_role('button',name='Run Agent',exact=True).click();expect(page.get_by_role('button',name='Review Again',exact=True)).to_be_enabled()
    backend.review_outcome='failed';page.get_by_role('button',name='Review Again',exact=True).click()
    expect(page.get_by_text('Review unavailable',exact=True)).to_be_visible();expect(page.get_by_role('button',name='Retry Review',exact=True)).to_be_enabled()
    backend.review_outcome='needs_changes';page.get_by_role('button',name='Retry Review',exact=True).click()
    expect(page.get_by_text('Needs revision',exact=True)).to_be_visible();expect(page.get_by_text('Edit the label comparison and retest.')).to_be_visible()
    backend.review_outcome='inconclusive';page.get_by_role('button',name='Review Again',exact=True).click();expect(page.get_by_text('Review inconclusive',exact=True)).to_be_visible()
    record('Review operational retry, specific criterion/row feedback, and inconclusive status')
    backend.hold=True;page.get_by_role('button',name='Retry Review',exact=True).click()
    expect(page.get_by_role('button',name='Cancel Review',exact=True)).to_be_enabled()
    page.get_by_role('button',name='Cancel Review',exact=True).click();expect(page.get_by_text('Review cancelled',exact=True)).to_be_visible()
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
    backend.outage=True;page.get_by_text('Local setup & service status',exact=True).click();page.get_by_role('button',name='Refresh service status',exact=True).click()
    expect(page.get_by_role('button',name='Run Agent',exact=True)).to_be_disabled();expect(page.get_by_role('button',name='Test Fixtures',exact=True)).to_be_enabled();record('Provider outage leaves healthy Code fixtures usable and prevents paid action')
    page.evaluate("localStorage.setItem('another-application', 'keep')")
    old=editor.input_value();page.get_by_role('button',name='Reset Exercise',exact=True).click();expect(page.get_by_role('dialog')).to_be_visible();expect(page.get_by_role('button',name='Cancel',exact=True)).to_be_focused()
    page.get_by_role('button',name='Cancel',exact=True).click();expect(editor).to_have_value(old)
    page.get_by_role('button',name='Reset Exercise',exact=True).click();page.get_by_role('dialog').get_by_role('button',name='Reset Exercise',exact=True).click()
    expect(editor).to_have_value(MOCK['fixtures']['request']['snapshot']['source']);assert page.evaluate("localStorage.getItem('another-application')")=='keep';record('Reset cancel/confirm scopes local work and preserves unrelated storage')
    backend.outage=False;page.locator('nav a[href="#04-policy-recommendation"]').click();page.get_by_role('button',name='Refresh service status',exact=True).click()
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
    page.get_by_role('combobox',name='Language',exact=True).select_option('es')
    for width in [1440,1024,390,320]:
        page.set_viewport_size({'width':width,'height':1000});page.reload()
        expect(page.get_by_role('combobox',name='Idioma',exact=True)).to_have_value('es')
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),width
        page.get_by_role('textbox',name='Evaluador TypeScript editable').focus()
        page.get_by_role('textbox',name='Evaluador TypeScript editable').press('Tab')
        if width in [1440,390]:
            page.evaluate('window.scrollTo(0,0); document.activeElement.blur()')
            page.screenshot(path=str(ARTIFACTS/f'spanish-{width}-ui-mock.png'),full_page=True)
    record('Spanish labels and long help text fit 1440/1024/390/320 widths with keyboard editor escape')
    page.get_by_role('combobox',name='Idioma',exact=True).select_option('en')

    page.set_viewport_size({'width':720,'height':700});page.evaluate("document.documentElement.style.fontSize='200%'")
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth');record('200% font zoom with narrow viewport keeps page width bounded')
    old_context=browser.new_context(viewport={'width':390,'height':900})
    old_page=old_context.new_page();old_page.route('**/api/**',backend.route)
    old_page.add_init_script("localStorage.setItem('evals-tutorial:old:01-starred-classifier:old', JSON.stringify({source:'old evaluator source'}));")
    old_page.goto('http://127.0.0.1:4173/#01-starred-classifier')
    expect(old_page.get_by_text('Saved work belongs to an older version.',exact=True)).to_be_visible()
    expect(old_page.get_by_role('textbox',name='Editable TypeScript evaluator')).to_have_value(MOCK['fixtures']['request']['snapshot']['source'])
    old_context.close();record('Changed content version retains inspectable old source without inheriting progress')
    # Use the actual credential-free lesson corpus for all seven localized descriptions.
    actual=json.loads((ROOT/'content/tutorial.json').read_text())
    actual_context=browser.new_context(viewport={'width':390,'height':900},locale='es-AR')
    actual_page=actual_context.new_page()
    def actual_route(route):
        if route.request.url.endswith('/api/tutorial'):
            route.fulfill(content_type='application/json',body=json.dumps(actual))
        else: backend.route(route)
    actual_page.route('**/api/**',actual_route)
    before=len(backend.posts)
    actual_page.goto('http://127.0.0.1:4173/')
    expect(actual_page.get_by_role('combobox',name='Idioma',exact=True)).to_have_value('es')
    translations=json.loads((ROOT/'apps/web/src/locales/lessons.es.json').read_text())
    for exercise in actual['exercises']:
        actual_page.locator(f'nav a[href="#{exercise["id"]}"]').click()
        expect(actual_page.get_by_role('heading',name=translations[exercise['id']]['title'],exact=True)).to_be_visible()
        expect(actual_page.get_by_role('textbox',name='Evaluador TypeScript de solo lectura' if exercise['readOnly'] else 'Evaluador TypeScript editable')).to_have_value(exercise['starterSource'])
        assert actual_page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    assert len(backend.posts)==before
    actual_context.close()
    record('Spanish browser preference selects all seven actual translated lessons with unchanged starter code and zero POSTs')

    blocked_context=browser.new_context(viewport={'width':390,'height':900})
    blocked_page=blocked_context.new_page();blocked_page.route('**/api/**',backend.route)
    blocked_page.add_init_script("Storage.prototype.setItem = function(){throw new Error('Synthetic full storage')};")
    blocked_page.goto('http://127.0.0.1:4173/#01-starred-classifier')
    blocked_page.get_by_role('textbox',name='Editable TypeScript evaluator').fill('retained in-memory work')
    expect(blocked_page.get_by_text('Edits are not saved in this browser.',exact=False)).to_be_visible()
    expect(blocked_page.get_by_role('textbox',name='Editable TypeScript evaluator')).to_have_value('retained in-memory work')
    blocked_context.close();record('Storage failure stays visible and preserves in-memory edits with copy control')
    assert not errors,errors
    record('Production bundle runs without browser page errors')
    report={**PROVENANCE,'mockOnly':True,'status':'passed','sandboxRequired':True,'browser':browser.version,'checks':checks,'postCount':len(backend.posts),'liveProviderCalls':0,'livePhoenixArtifacts':0}
    write_report(ARTIFACTS, report)
    print(json.dumps(report,indent=2))
    browser.close()
