# Mac candidate handoff

This candidate is ready for local installation and explicit live-provider testing
with the published integration validation receipt. Cloud evidence covers
locked installs, Code fixtures, restricted Docker and actual Phoenix persistence.
The macOS/ARM64 wheels are available; actual Mac/browser/model acceptance is open.

1. Start Docker Desktop and select its local context. Have Node 24.x/npm 11.x and
   Python 3.12 available as node, npm and python3. Preserve normal TLS validation.
2. Verify the delivered ZIP's sidecar SHA-256, extract into a new directory, then
   cd into the extracted evals-tutorial directory. Paths containing spaces work.
3. Run npm run install:all, then npm run start. Open http://127.0.0.1:3000 and
   http://127.0.0.1:6006. No credential is needed for this first stage.
4. In a second terminal in the same directory, run npm run demo:check. It makes no
   model calls. It checks actual Docker restrictions, compiles all seven starters,
   proves fixture discrimination/error separation and records results in Phoenix.
5. Stop with npm run stop. If .env does not exist, copy .env.example to .env. Set
   TUTORIAL_PROVIDER=openai, an explicitly selected compatible TUTORIAL_MODEL and
   an existing TUTORIAL_API_KEY. Do not create a new credential for this task or
   paste a key into the browser/chat/source. An existing shell OPENAI_API_KEY may
   be explicitly exported as TUTORIAL_API_KEY; there is no automatic fallback.
6. Run npm run env:check -- --require-provider, then npm run start. In the second
   terminal, npm run demo:check -- --live explicitly makes the one-example intro
   agent request (at most 2048 output tokens, zero automatic retries). It verifies
   real model/agent traces and Phoenix recording. This is a paid intro-only probe.
7. Use the UI for the six cases. Edit only TypeScript evaluators, validate, test
   fixtures, run the prepared agent and explicitly request DOUBLE CHECK. Known bad
   response fixtures should earn a failing score while their fixture assertion
   passes. An unfinished evaluator is an execution error with no score.
8. Verify PNG document perception, independent wages/withholding tie-out,
   uncertainty, bounded policy judging, educational review and real Phoenix links.
   PDFs are downloadable consultation artifacts; current agent media support is
   PNG/JPEG. Do not infer PDF model support from an SDK serialization test.
9. If execution succeeded but Phoenix recording failed, use Retry Phoenix
   recording or npm run telemetry:retry -- RUN_ID. These use stored results and
   do not repeat inference. Stop preserves Phoenix and run receipts; review status
   is session-local and must not be restored as completed after restart.

Record exact candidate SHA, Mac architecture, Node/Python/Docker versions, selected
provider/model (never a key), run IDs and verified Phoenix URLs. Keep failures as
failures. A successful intro is not the full Mac, corporate Azure or 150–180 minute
workshop gate. Azure requires an explicitly configured resource-root endpoint and
API version, existing corporate access and its own live evidence. There is no
cross-provider fallback, hosted deployment, booking, filing or transmission.

The header language selector offers English and Spanish. The saved browser
preference takes priority over supported browser languages; English is the fallback.
Switching retains edited TypeScript, progress and run results. Inspect all seven
lessons, accessibility labels, long Spanish text at narrow widths and 200% zoom.
The browser language preference survives exercise/tutorial resets. If storage is
blocked, keep the tab open; selection and edits remain in memory with visible notices.

New explicit educational reviews request feedback in the selected language.
Existing feedback remains unchanged and displays its requested language, or an
unknown-language notice for older receipts. Provider language compliance requires
live rehearsal. Language switching never requests paid review or translates stored
feedback. Raw diagnostics, JSON, code and quoted review evidence retain their
original text. This Cloud candidate's sandboxed visual check is blocked by the
Chromium sandbox configuration; Mac/browser and live-provider gates remain pending.
