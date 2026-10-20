# Evaluation workshop curriculum v1

The workshop has one read-only introduction, six editable exercises and a final
read-only guided specification and regression example. This document describes
the educational design; the packaged corpus is in `content/tutorial.json`.
Actual provider behavior and Phoenix recording require separate run evidence.
Read [case schemas and fixture truth](cases.md), [document authoring truth](documents.md)
for the educational design.

The implementation contract is [v1](../contracts/v1.md). The curriculum describes
the educational design; runtime schemas remain authoritative.

## Learner flow

Read the criterion and its reference evidence. Inspect correct and incorrect
response fixtures. Finish the small TypeScript evaluator, validate it and test
the fixtures. Then explicitly run the prepared Python agent on the same dataset
version. Compare expected, actual and evaluation; open the recorded Phoenix
experiment and trace. Optionally compare the prepared second agent version
using the same data and evaluator. Python and dataset JSON are consultation tabs;
only the TypeScript evaluator is edited.

An evaluator that correctly rejects a poor agent response is doing its job. A
valid `fail` is different from a compiler/runtime/provider/recording error.
The latter must stay an error rather than becoming a zero score or a pass.

## Introduction: follow one response through the loop

Badge: **Code**. Route `intro`. Read-only. Dataset `intro-v1`, one example
`intro-star`: input `{messageId:"intro-message",text:"Workshop reminder",starred:true}`;
reference `{label:"starred"}`. The tiny prepared agent returns `{label}` and
the supplied evaluator checks that exact label. No learner TODO or mandatory
fixtures/review/completion gate here; this is the single introduction.

Learner text: "Press Run Demo to see one input become a response. The evaluator
compares that response with an independently written reference. Open the
experiment to compare results, then the trace to inspect this actual run."
Navigation makes no provider request. Run Demo discloses one agent call; failures
show their actual status. Phoenix links appear after recording/read-back, with
unavailable links labelled honestly. An evaluator source panel can be read-only.

Nearby concepts, shown next to the relevant result rather than in another lesson:

| Concept | Short learner text | Contextual reading |
| --- | --- | --- |
| Input | What the agent receives. | [Phoenix evaluator inputs](https://arize.com/docs/phoenix/sdk-api-reference/typescript/packages/phoenix-client/experiments#evaluator-inputs) |
| Response | What this agent actually returned. | Same inputs link beside actual response. |
| Reference | The author's independent expected answer; the agent cannot see it. | Same inputs link beside reference. |
| Evaluator / score | A rule that explains how well this response meets one criterion; 1 means satisfied, 0 means failed. | [Code evaluation](https://arize.com/docs/phoenix/sdk-api-reference/typescript/packages/phoenix-client/experiments#code-based-example) |
| Dataset | Fixed versioned examples reused across runs. | [Dataset concepts](https://arize.com/docs/phoenix/datasets-and-experiments/concepts-datasets) |
| Experiment | Responses and evaluations for a particular dataset/run. | [Experiments](https://arize.com/docs/phoenix/sdk-api-reference/typescript/packages/phoenix-client/experiments) |
| Trace | Recorded steps and model calls from this execution. | [Trace evaluation](https://arize.com/docs/phoenix/sdk-api-reference/typescript/packages/phoenix-client/experiments#trace-based-evaluation) |

These links were opened on 2026-10-14; they explain concepts, not proof of this
tutorial's installed SDK compatibility. Adapter/version verification belongs to 00/03/07.

## Six short lessons

Each paragraph below summarizes the explanation above the editor. Criterion
IDs, schemas, TODOs and fixture expectations are in [cases.md](cases.md).

| Destination | Badge | Explanation above editor | Required evidence to inspect |
| --- | --- | --- | --- |
| `01-starred-classifier` | **Code** | A star is an explicit boolean, not an estimate of urgency. Check both starred and unstarred responses before running the agent. | A correct starred response passes; an urgent unstarred message still means `not_starred`. |
| `02-document-classification` | **Code** | Read the synthetic page and evaluate its class. An unfamiliar page should stay unknown; an unreadable page should say so. | Known types, unknown and unreadable; a confident wrong class fails. |
| `03-independent-tie-out` | **Code** | Check what was extracted before trusting a total. Add W2 wages and withholding separately, then compare each with the independently authored 1040 amount. A truthful mismatch can pass. | Neither, wage-only, withholding-only and both mismatches; false balancing values fail. |
| `04-policy-recommendation` | **Mixed** | Check the supplied citation text and evidence IDs in code. Ask an LLM judge whether the recommendation actually follows this fictitious policy and these facts. | Good advice, a real but misapplied clause, invented citation and insufficient evidence. Subcriterion `policy-quality` is **LLM Judge**; `policy-evidence` is **Code**. |
| `05-package-readiness` | **Code** | Check completeness and discrepancies before saying ready for human review. Keep human approval separate. This tutorial never transmits a package. | Missing item, unresolved discrepancy, awaiting approval and approved-without-send. |
| `06-simulated-travel` | **Code** | Recommend one fixed simulated round trip within the requested dates and total budget. If no supplied option qualifies, say no options. | Exact dates, fare plus fees, budget boundary and no invented flights or booking. |

One short contextual link per advanced case is sufficient: C2/C3 can show
[MAF image input](https://learn.microsoft.com/en-us/agent-framework/agents/multimodal)
beside the read-only document preview, and C4 can show
[model-backed evaluation](https://arize.com/docs/phoenix/sdk-api-reference/typescript/packages/phoenix-client/experiments#model-backed-example)
beside its LLM Judge badge. Do not ask learners to implement those SDK examples.

## Response judge and DOUBLE CHECK

The C4 response judge reads one immutable policy row and grades the **agent
response**. It is part of the learner's evaluator. Even prepared fixture judging
can consume tokens. Code cases' fixture tests make zero provider calls. With
correct C4 evidence checks, seven fixtures reach the judge and three fail before
it. The broker enforces one judge call per fixture, so an edited evaluator can
consume up to ten calls in one fixture run. Each call has at most 2048 output
tokens and no automatic retries. Real runs show their separate agent/judge call
budgets before starting.

DOUBLE CHECK is a later, separate **nonexecuting evaluator-code educational
review**. It reads the current rubric, evaluator source as text, fixture results
and completed real-run evidence. It never imports/runs that code or invokes
tools. One explicit review call, at most 2048 output tokens, no automatic retries;
an explicit eligible retry shows cost and preserves the prior receipt. The same
global provider profile applies to agent, judge and reviewer with separate role
provenance.

The introduction and six-case baseline include 25 agent calls (one intro plus
24 case rows), ten C4 judge calls with correct evidence checks (seven fixture
outputs plus three real rows), and six educational reviews: 41 inference calls.
The enforced upper bound is 44 calls if the edited evaluator invokes the judge
for every fixture. Running both versions in the final guided example adds six
agent calls and no judge or review calls, for 47 expected calls or an upper bound
of 50 before explicit retries or revised reruns. Each button shows its own subset,
configured output limits and potential cost; navigation is free.
Malformed/failed rows can reduce actual completed calls, not justify hidden retries.

Eligibility: valid current source, discriminating current fixture results and
a completed real-agent run on the same bound snapshot. A failing agent score
does not block completion when the evaluator is correct. Review statuses and
binding follow the architecture: `ready`, `needs_changes`, `inconclusive`, with
operational errors separate. Only current `ready` earns educational completion.
Code/rubric/data/fixture/run/agent/provider changes invalidate it; late results
remain historical. Specific criterion/example/code evidence and a next learning
action are required. No anti-cheating or infallibility claims; this badge is
unrelated to C5's simulated human approval state.

## 180-minute rehearsal script

Release owner times a fresh learner from a clean ZIP; the figures below are
targets, not measured results. The final 15 minutes cover the guided example.
Same-day preparation remains the delivery target.

| Minutes | Segment | Rehearsal action |
| --- | --- | --- |
| 0-15 | Setup | Install both languages, configure existing credentials, start, pass offline demo check. |
| 15-25 | Intro | Run once; explain reference/actual/evaluation; open actual experiment and trace. |
| 25-40 | C1 | Complete TODO, observe one positive and two discriminating negatives, real run. |
| 40-60 | C2 | Compare same-page preview and response; test unknown/unreadable cases; real run. |
| 60-85 | C3 | Calculate 6050000 wages and 605000 withholding independently; inspect both mismatch directions and false balance; real run. |
| 85-105 | C4 | Read four fictitious clauses, see judge cost, test fluent wrong advice and citations, real run. |
| 105-120 | C5 | Show why ready and approved both still cannot send; fixtures then real run. |
| 120-140 | C6 | Check dates and total including fees; no-options row; real run. |
| 140-165 | Review and buffer | Request DOUBLE CHECK for six completed cases; inspect specific findings; revise/retest or retry a failed review. |
| 165-180 | Guided specification and regression | Inspect the specification and prepared evaluator, run both fixed agent variants, then compare actual per-requirement evidence. |

Record setup/learning/review/wait times separately, friction, call counts and
unavailable providers. If total exceeds 180 minutes, shorten prose and default
batches while retaining six cases and mandatory negative coverage. Agent quality
and a fallible judge may require extra time; never silently waive release gates.

No Kaggle, external datasets, real personal identifiers, corporate imagery,
extra challenges, separate OCR, outbound transmission or booking are required.
All monetary/accounting/travel rules are deliberately fictitious teaching rules.
