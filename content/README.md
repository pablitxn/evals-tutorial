# Original synthetic workshop content

The served view is `tutorial.json`: one read-only introduction, six editable
TypeScript evaluator exercises and a final read-only specification-driven
regression example, with immutable dataset JSON and read-only Python consultation.
The corpus supplies 65 response fixtures: the original 60 plus five explicit
author fixtures for the guided example. All content is original project-authored
training material; no downloaded dataset, corporate image or personal identifier.
Original project-authored material is covered by the repository's
[MIT license](../LICENSE). Dependencies retain their own licenses.

`documents/tax-demo-v1/manifest.json` binds nine opaque primary PNG document IDs
TD-001 through TD-009 and nine matching PDF representations. C2 and C3 reference
this exact manifest hash. PDF pages contain the same raster artwork, with no
hidden text layer, and require separately verified provider support. PNG is the
first format; do not substitute reference text or introduce OCR on format failure.
Authoring provenance and separate ground truth stay outside model requests.

From the repository root, using existing pinned npm dependencies:

```sh
node --import tsx --test content/authoring/*.test.ts
```

The tests load the actual content through the frozen ContentService, validate
all envelopes/domain schemas and hashes, independently check source amounts,
recompute wage/withholding ties, grade all 55 deterministic fixtures, verify three
policy evidence failures, preserve seven semantic judge fixtures as unverified,
and reject tampered content. They never execute submitted learner code or make
provider calls. Wrong semantic responses are schema-valid on purpose; malformed
shape/calendar probes live separately in `authoring/schema-probes.json`.

To regenerate original page artwork and content, authoring tools are Pillow
12.3.0, ReportLab 4.4.9 and an existing system DejaVu Sans font. Font files are not
bundled. These tools are optional authoring dependencies, not learner prerequisites:
all generated PNG/PDF bytes are already packaged. In the verified authoring environment:

```sh
python3 content/authoring/build.py
node --import tsx content/authoring/finalize.ts
node --import tsx --test content/authoring/content.test.ts
```

Both build and finalization are required: finalization uses the frozen contracts'
RFC 8785 `datasetHash`, not an independently maintained canonicalizer. Modified
content requires a new author-created version; do not overwrite a released dataset.

The TypeScript intro and final guided evaluator are complete; each editable
practical starter contains specific TODOs and throws until completed. Fixture pass means evaluator discrimination, not
agent quality. Policy quality requires a fallible bounded response judge; final
DOUBLE CHECK is a separate nonexecuting review of evaluator code and recorded
results. No transmission or booking capability exists in this content.

The served `pythonSource` is verified against `consultation-sources.json` and the
installed prepared runtime. It shows the actual Microsoft Agent Framework call
and installed prompts. The final example also stores that complete consultation
in `exercises/07-spec-regression/agent_consultation.py`; the original authoring
boundary helpers remain preserved beside the original seven entries.

After changing runtime prompts or broker code, refresh the shown prompts and
their provenance without regenerating any dataset, fixture or document:

```sh
python3 content/authoring/sync-consultation.py
```

This refreshes every installed variant. The guided-example builder also invokes
it, so editing a baseline prompt cannot leave the read-only consultation stale.

To rebuild only the final example without regenerating documents or the original
seven exercises, run:

```sh
python3 content/authoring/build-spec-regression.py
node --import tsx content/authoring/finalize.ts
```

The main `build.py` invokes this same append step. It reuses case 06's three
domain schemas, publishes a schema-only Python projection, and refreshes the
consultation source hashes. The one three-case dataset is unchanged between
`baseline` and `omit-fees`; both variants invoke the existing real provider
runtime. The latter prompt deliberately ignores mandatory fees in totals and
eligibility. Dataset references, metadata, explicit fixtures and offline tests
are authored teaching material; they are never provider results or agent inputs.
