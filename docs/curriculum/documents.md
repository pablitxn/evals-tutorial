# Shared synthetic form authoring specification

Dataset producer 04 owns implementation after v1 contract freeze. This document
specifies original pages and independent truth; it creates no actual PDF/image,
downloaded dataset or model-derived reference. See the local curriculum and
[integration contract](../contracts/v1.md) for scope.

## Original content and identity

Document set `tax-demo-v1`, version `1.0.0`; intended location
`content/documents/tax-demo-v1/`. Author an original simple teaching layout,
not a downloaded government form or corporate image. Page titles use 1040,
W2 and 1099INT so the exercise can classify them; do not imply legal form validity.
Every page includes "SYNTHETIC TRAINING DOCUMENT - NOT FOR FILING" and a visible
opaque document ID. Filenames and inference-facing metadata use only opaque IDs
(e.g. `TD-001.png`), never author aliases that reveal class or reference amounts.
Fictional subject `Demo Person A`, employer `Demo Employer A/B`,
interest payer `Demo Bank`; no address, SSN, tax ID, account number, signature,
corporate logo or real person's name. Year 2025 and currency USD throughout.

Owned original text, layout, facts and response fixtures: no third-party dataset,
image or license dependency. Producer records generation command/tool versions,
authorship date, source recipe SHA, file/page SHA-256, MIME, dimensions and shared
IDs. Use the owner repo's adopted license; until selected, record original
project-authored material and no third-party assets without inventing a legal
license grant. Authoring numbers below are independent of every evaluated model.

## Canonical page truth

Display dollar amounts with two decimal places; references store integer cents.
Blank irrelevant fields become null, never zero. Each page is one readable page,
except the deliberately obscured page. These are simplified teaching field
names, not a claim about current government tax-form line numbers.

| Document ID | Visible title / fields | Independent reference cents |
| --- | --- | --- |
| `TD-001` | W2; Demo Employer A; Wages 42000.00; Federal withholding 4200.00 | W2/read; wages 4200000; withholding 420000; interest null. |
| `TD-002` | W2; Demo Employer B; Wages 18500.00; Federal withholding 1850.00 | W2/read; wages 1850000; withholding 185000; interest null. |
| `TD-003` | 1040; Total W2 wages 60500.00; Withholding from W2s 6050.00 | 1040/read; wages 6050000; withholding 605000; interest null. |
| `TD-004` | 1040; Total W2 wages 61500.00; Withholding from W2s 6050.00 | 1040/read; wages 6150000; withholding 605000; interest null. |
| `TD-005` | 1040; Total W2 wages 60500.00; Withholding from W2s 6150.00 | 1040/read; wages 6050000; withholding 615000; interest null. |
| `TD-006` | 1040; Total W2 wages 61500.00; Withholding from W2s 6150.00 | 1040/read; wages 6150000; withholding 615000; interest null. |
| `TD-007` | 1099INT; Demo Bank; Interest income 125.00; no wages/withholding fields | 1099INT/read; wages null; withholding null; interest 12500. |
| `TD-008` | Workshop lunch note; Sandwiches 12; no tax-form title/amounts | unknown/unsupported; all three amount fields null; classification readable. |
| `TD-009` | Original generic form-like marks obscured until title and amounts cannot be read; synthetic mark/document ID remain visible | unknown/unreadable; all three amount fields null; classification unreadable. |

Obscured page has no recoverable hidden text layer, metadata or filename revealing
a known form class/amount. It stands for missing W2-B in one tie-out input, but
input neither supplies that form label nor reveals its wages. Its source art is
authored independently as unreadable material; do not reuse W2-B's hidden text.

## Independent reconciliation worksheet

Separately author the worksheet from the declared values before agent inference.
Verify `4200000 + 1850000 = 6050000` and
`420000 + 185000 = 605000`. Sum only W2s. Interest 12500 is deliberately separate.
Use no tolerance, no floating-point dollar sums; zero delta means match. Negative
delta means W2 sum is lower than the 1040. Record the two sides and source IDs.

| Row | 1040 ID | Wages: W2 sum / 1040 / delta / verdict | Withholding: W2 sum / 1040 / delta / verdict |
| --- | --- | --- | --- |
| `tie-balanced` | TD-003 | 6050000 / 6050000 / 0 / match | 605000 / 605000 / 0 / match |
| `tie-wages` | TD-004 | 6050000 / 6150000 / -100000 / mismatch | 605000 / 605000 / 0 / match |
| `tie-withholding` | TD-005 | 6050000 / 6050000 / 0 / match | 605000 / 615000 / -10000 / mismatch |
| `tie-both` | TD-006 | 6050000 / 6150000 / -100000 / mismatch | 605000 / 615000 / -10000 / mismatch |
| `tie-missing` | TD-003 | null / 6050000 / null / indeterminate | null / 605000 / null / indeterminate |

Each complete row input contains its one 1040, W2-A, W2-B, 1099INT-A, unknown-note.
Each tie's exact `documentIds` set is its 1040 + W2-A + W2-B. For tie-missing,
replace W2-B with unreadable-page in both input and tie source IDs; no fabricated
W2-B reading. Every independent expected reading comes from the canonical table.
A truthful mismatch or indeterminate response passes; fabricated balanced values
fail against per-page truth even if the agent's own arithmetic is internally sound.

No reference is copied from agent extraction. Producer supplies two independent
review steps: inspect rendered page fields against source recipe, then check
worksheet arithmetic against author-declared values. Differences fail corpus
acceptance; an LLM may be inspected but cannot supply or repair ground truth.
Record both checks and limitations in 04's receipt.

## Format and capability acceptance

Generate legible PDF plus per-page PNG adapters from original owned layout
sources. Prefer large text, upright page, whitespace and small single-page files;
no corporate styling. PDF and PNG are two representations of one document ID;
manifest records both digests and their generation relation. References live in
separate author-only JSON and are never injected as agent reading aids.

00/05 verifies the actual selected provider/model/API for the packaged MIME and
adapter. If PDF unsupported but PNG verified, use the same pre-rendered PNG for
both preview and inference and record preprocessing/format provenance. If neither
format is verified, document runs remain blocked with a capability error. No
hidden OCR, text answer-key replacement or cross-provider fallback. A valid
unknown/unreadable domain result differs from a failed transport/format request.

Manifest must declare document ID, set/version, source hash, MIME, page index,
relative allowlisted path, byte length, SHA-256 and representation relation.
Hash placeholders stay labelled pending until actual bytes exist; do not invent
hashes. Dataset references bind this manifest hash into their content identity.
Same IDs/page bytes supply C2 classification and C3 extraction, preventing silent
different-document comparisons. Changes require a new manifest/data version.
