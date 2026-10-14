# ET-WP-01 specification receipt

Frozen: 2026-10-14T13:38:30+00:00. Status: specification complete in an isolated task-local handoff;
contract acceptance and focused branch/PR publication pending supplied foundation.
No implementation, corpus generation, provider run, Phoenix artifact, ZIP release,
merge or deployment is claimed.

## Identity, scope and sources

- Owner: https://github.com/pablitxn/evals-tutorial; mounted root
  `/workspace/evals-tutorial`; isolated deliverables `/workspace/et-wp-01-handoff`.
- Assigned scope: `docs/curriculum/**` and `docs/evidence/ET-WP-01/**` only.
  Root manifests/contracts/application/content trees and initial repo commit are
  reserved for ET-INTEGRATOR. No changes were made to either mounted Git checkout.
- Integrator Astra thread `01a13a94-f55c-7187-bac7-8f4acaa910d2`; readiness
  `01a13a94-6e52-7043-8547-fae0286d60c0`; parent/source thread
  `01a118ed-6bf7-7481-93e6-336de48270f7`. Dependency heads not supplied yet.
- Atlas checkout original HEAD `474f561da362def07f5f1883f58a3db840f02b2c`,
  clean branch `work`; freshly fetched `origin/main`
  `8b8f5acebc7cd4430b7b1b7943b5f9e09817ab0e`. Consulted minute
  `atlas/entries/2026-10-14-evals-tutorial-design-call.md`, architecture
  `atlas/wiki/evals-tutorial-architecture-20261014.md`, roadmap
  `atlas/wiki/evals-tutorial-roadmap-20261014.md`, and SDK evidence at that SHA.
  Documents link those immutable sources. Current user delegation supplies
  authorization absent from those historical planning-state descriptions.
- Read sysadmin root/Atlas AGENTS, `.agents/skills/atlas-navigate/SKILL.md`,
  source-of-truth policy, discussion protocol, engineering-language and
  Cloud identity standards. Current main instructions/Atlas navigation skill
  match consulted local copies (`git diff HEAD origin/main -- ...`: empty).
  No owner-repo AGENTS/skills exist in its unborn checkout.
- Requested assignment: GPT-6.1 Sol HIGH FAST. Actual model/effort/FAST launcher
  metadata is not exposed through the available tools; no verified selection
  or speed claim, and no alternate model was launched. Parent owns dispatch proof.
- Application base/final head: none. Successful read-only remote-ref checks
  returned no HEAD or main ref, and owner status is `No commits yet on work`.
  No SHA is invented from Atlas; no specification branch or PR exists yet.

## Concrete delivered specification

- `docs/curriculum/README.md`: one read-only real intro, six concise learner
  lessons, Code/LLM Judge/Mixed badges, contextual official-doc links, fixture-first
  TypeScript flow, separate nonexecuting DOUBLE CHECK and 170-minute rehearsal.
- `docs/curriculum/cases.md`: proposed closed input/output/reference shapes,
  evaluator TODOs, 59 fully specified response-fixture expectations, schema-error
  probes, criterion IDs and acceptance rules.
- `docs/curriculum/documents.md`: nine original synthetic page specifications
  TD-001..TD-009 shared by classification/extraction, independent cents/field
  mappings, four-way mismatch worksheet, null/indeterminate case and verified
  PDF/PNG-only format fallback rules without OCR or reference injection.
- `docs/curriculum/handoff.md`: early decisions for integrator/dataset producer;
  integer USD cents, zero tolerance, policy citations, approval/no-send and
  dates/budget/no-options; exact publication/resumption boundary.
- Specification version requests: tutorial/exercise/rubric/dataset/fixture 1.0.0;
  canonical runtime schema version pending integrator. Documents/datasets/fixtures
  remain specifications, not generated files or live runtime registrations.

59 semantic fixtures comprise 24 positive, 34 negative, one partial. Required
negatives reject always-pass; positives reject always-fail. Cases also discriminate
always-starred/unknown/match/ready/no-options and citation-membership-only advice.
Truthful wage/withholding mismatch reports pass while invented false balancing
extraction fails. Schema-invalid output is an operational validation error,
separate from schema-valid semantic failure.

## Commands and observed evidence

| Check | Exit / observed result |
| --- | --- |
| `git -C /workspace/sysadmin-workspace fetch origin main` | 0; source main resolved above. |
| `git -C /workspace/evals-tutorial ls-remote origin HEAD refs/heads/main` (initial and final) | 0; no refs. No access failure was interpreted as an empty repository. |
| `git -C /workspace/evals-tutorial status --short --branch` | 0; clean unborn `work`. |
| `python3 /workspace/sysadmin-workspace/tools/cloud_git_identity.py --repo /workspace/evals-tutorial` | 1; effective author mismatch. Identity-only config inspection reports global Pablo Coronel / accounts@pablocoronel.com. Required both roles: Pablo Coronel <git@pablocoronel.com>. No config/credential changes or commits performed. |
| `python3 docs/evidence/ET-WP-01/specification-check.py` (handoff root) | 0; six cases, required positive/negative coverage, 59 fixture count, arithmetic, Markdown fences/local links/ASCII/whitespace. Frozen stdout: `20261014T1338Z-static-check.txt`. |
| Per-file `git diff --no-index --check /dev/null <curriculum-file>` | no whitespace diagnostics; no-index differing-content exit 1 allowed only with empty stdout/stderr. |
| Official Phoenix experiments/datasets and MAF multimodal page opens | Successful on 2026-10-14; conceptual links only, no installed SDK/provider compatibility claim. |
| `codex queue --thread <integrator-or-parent> --message <status>` | Both exited 1: local session SQLite DB could not initialize at `/run/codex-environment/codex-home/state_5.sqlite`. No messages delivered. No permission escalation or auto-review rejection occurred. Early decisions remain in handoff.md; parent receives final via platform. |

Environment: Linux container `/workspace`; Node v24.19.0, Python 3.12.14,
Git 2.52.0. A first ad hoc checker overmatched policy data rows and the Cross-case
heading; a subsequent check treated no-index content-difference exit 1 as an
error. The frozen checker fixes both bookkeeping issues and passes. A counted
judge-budget inconsistency in the draft was corrected to seven Code-passing
policy fixtures / three Code failures before freeze. No runtime test was hidden.

## Limits and next concrete step

Static checks verify authored specification consistency only. No executable
schemas, learner evaluators, actual rendered documents, agents, LLM judging,
review, cancellation/timeouts, Docker, browser, Phoenix, clean-install or learner
rehearsal were run. No run IDs, Phoenix IDs/links, provider identifiers, API keys
or document byte hashes exist to record. No paid calls or retries occurred.
C4 expected bands require live calibrated judging; mocks cannot establish it.

Engineering prose was reviewed in English and kept ASCII. Atlas's instruction
allowlist/commit/CI checks do not certify untracked docs in this empty owner repo;
owner CI and commit checks await foundation. No CI run is claimed. No commit
exists, so identity attribution/linkage cannot be certified. Publishing must use
an isolated checkout from the supplied SHA, apply/check the canonical identity
helper there, and verify author plus committer after the authorized commit.

Remaining integration dependencies: readiness/integrator supplies foundation SHA,
actual owner instructions and schema/fixture/rubric freeze; parent supplies
observable authoring model/effort/FAST receipt. Source-license adoption and actual
provider document-format support remain producer/readiness decisions, explicitly
recorded rather than silently assumed. These do not prevent review of this spec.

Publish only owned docs from that immutable base with English Conventional Commit
`docs(curriculum): specify intro and six fixture-first exercises` and a focused
draft PR, preserving no-merge/no-deploy/no-credential scope. No independent
repository initialization. Stop here; parent can resume this session for ET-WP-04
actual corpus only after contracts are frozen.

Hashes of frozen deliverables are in `artifact-sha256.txt`; it excludes itself to
avoid self-reference. No self-referential final commit or artifact hash is used.
