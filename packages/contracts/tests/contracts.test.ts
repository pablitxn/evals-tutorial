import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { validateContract } from '../src/index.js';
import { canonicalJson, datasetHash, sha256 } from '../src/node.js';

const good={score:1,label:'pass',explanation:'Matches the independent reference'};
test('scores reject contradictions, non-finite values and unbounded/unknown fields',()=>{
  assert.equal(validateContract('EvalResult',good).valid,true);
  for (const value of [{...good,score:0.5},{...good,score:NaN},{...good,label:'fail'},{...good,extra:true},{...good,explanation:''},{...good,score:Infinity}]) assert.equal(validateContract('EvalResult',value).valid,false);
  assert.equal(validateContract('EvalResult',{...good,label:'partial',score:0.5}).valid,true);
});
test('wire validators execute with string code generation disabled',()=>{
  const result=spawnSync(process.execPath,['--disallow-code-generation-from-strings','--input-type=module','-e',`
    import assert from 'node:assert/strict';
    import { EvalResult, PhoenixLinks } from './packages/contracts/src/validators.generated.mjs';
    assert.equal(EvalResult({score:1,label:'pass',explanation:'Supported reference'}),true);
    assert.equal(EvalResult({score:0,label:'pass',explanation:'Contradiction'}),false);
    assert.equal(PhoenixLinks({datasetVersionId:'RGF0YXNldFZlcnNpb246MjU=',experimentId:'RXhwZXJpbWVudDo1OA=='}),true);
  `],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr || result.error?.message);
});
test('requirement results are optional, bounded and obey the same score rules',()=>{
  const criterion={criterionId:'R1',...good};
  assert.equal(validateContract('EvalResult',{...good,criteria:[criterion]}).valid,true);
  for(const criteria of [[],Array(13).fill(criterion),[{...criterion,score:0}], [{...criterion,criterionId:''}], [{...criterion,extra:true}]]) {
    assert.equal(validateContract('EvalResult',{...good,criteria}).valid,false);
  }
});
test('Phoenix opaque GlobalIDs retain padding without broadening tutorial IDs or URLs',()=>{
  const ids={datasetId:'RGF0YXNldDox',datasetVersionId:'RGF0YXNldFZlcnNpb246MjU=',experimentId:'RXhwZXJpbWVudDo1OA=='};
  assert.equal(validateContract('PhoenixLinks',ids).valid,true);
  for(const key of Object.keys(ids)){
    for(const value of ['', 'a=b', 'abc===', 'a b', 'a\n', 'x'.repeat(129)]){
      assert.equal(validateContract('PhoenixLinks',{...ids,[key]:value}).valid,false,`${key}: ${JSON.stringify(value)}`);
    }
  }
  assert.equal(validateContract('PhoenixLinks',{datasetUrl:'https://example.com/'}).valid,false);
  assert.equal(validateContract('AcceptedRun',{runId:ids.experimentId}).valid,false);
});
test('agent requests exclude references, fixture answers, source and arbitrary provider routing',()=>{
  const request={schemaVersion:'1.0.0',runId:'run-1',exampleId:'ex-1',exerciseId:'intro',agentVariant:'baseline',input:{text:'synthetic'},documents:[],deadlineMs:10000};
  assert.equal(validateContract('AgentRequest',request).valid,true);
  for(const key of ['expected','fixtures','source','apiKey','model','endpoint']) assert.equal(validateContract('AgentRequest',{...request,[key]:{}}).valid,false);
  assert.equal(validateContract('AgentRequest',{...request,deadlineMs:60001}).valid,false);
});
test('broker rejects URL/model selection and oversized rubrics',()=>{
  const request={rubric:'Check supported evidence',criterionIds:['support']};
  assert.equal(validateContract('JudgeRequest',request).valid,true);
  for(const value of [{...request,model:'anything'},{...request,url:'https://example.com'},{...request,criterionIds:[]},{...request,rubric:'x'.repeat(8001)}]) assert.equal(validateContract('JudgeRequest',value).valid,false);
});
test('canonical content hash is stable across key order and includes document hash',()=>{
  const value={schemaVersion:'1.0.0' as const,datasetId:'intro',datasetVersion:'1',examples:[],documentManifestRef:null};
  assert.equal(datasetHash(value),datasetHash({...value,contentHash:'a'.repeat(64)}));
  assert.equal(canonicalJson({z:1,a:[true,'é','😀']}),canonicalJson({a:[true,'é','😀'],z:1}));
  assert.notEqual(sha256('source\n'),sha256('source'));
  assert.throws(()=>canonicalJson({value:NaN}));
});
test('Python and TS validate and hash the same wire data',()=>{
  const fixture={z:[true,'é','😀',null],a:{money:1234500,score:0.5,small:1e-7,large:9000000000000}};
  const python=process.env.TUTORIAL_TEST_PYTHON ?? '.venv/bin/python';
  const result=spawnSync(python,['-c',`import json,sys\nfrom tutorial_contracts import canonical_json,validate_contract\nvalidate_contract('EvalResult',${JSON.stringify(good)})\nprint(canonical_json(json.load(sys.stdin)))`],{input:JSON.stringify(fixture),encoding:'utf8',env:{...process.env,PYTHONPATH:'packages/contracts/python'}});
  assert.equal(result.status,0,result.stderr || result.error?.message);
  assert.equal(result.stdout.trim(),canonicalJson(fixture));
});
test('Python rejects invalid envelopes and imports generated types',()=>{
  const result=spawnSync(process.env.TUTORIAL_TEST_PYTHON??'.venv/bin/python',['packages/contracts/tests/python-negative.py'],{encoding:'utf8',env:{...process.env,PYTHONPATH:'packages/contracts/python'}});
  assert.equal(result.status,0,result.stderr || result.error?.message);
});
