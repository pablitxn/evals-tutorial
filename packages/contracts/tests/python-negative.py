"""Independent schema rejection checks, called by the Node contract suite."""
from tutorial_contracts import validate_contract
from tutorial_contracts.generated import AgentRequest, EvalResult
valid={'score':1,'label':'pass','explanation':'Supported reference'}
validate_contract('EvalResult',valid)
for value in [{**valid,'score':0},{**valid,'score':float('nan')},{**valid,'extra':1},{**valid,'explanation':''}]:
    try:validate_contract('EvalResult',value)
    except Exception:pass
    else:raise AssertionError('Invalid result was accepted')
request={'schemaVersion':'1.0.0','runId':'r','exampleId':'e','exerciseId':'intro','agentVariant':'baseline','input':{},'documents':[],'deadlineMs':1000}
validate_contract('AgentRequest',request)
try:validate_contract('AgentRequest',{**request,'expected':{'answer':'not allowed'}})
except Exception:pass
else:raise AssertionError('Expected reference leaked into agent envelope')
print('Python invalid boundary cases rejected; generated types import successfully')
