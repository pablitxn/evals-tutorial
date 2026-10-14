# Original synthetic workshop content

The served view is `tutorial.json`: one read-only introduction and exactly six
TypeScript evaluator exercises, with immutable dataset JSON and read-only Python
consultation. The corpus supplies 60 response fixtures: one intro fixture plus
the curriculum's 59 practical fixtures. All content is original project-authored
training material; no downloaded dataset, corporate image or personal identifier.
The project has not selected a source license; no new legal grant is invented here.

`documents/tax-demo-v1/manifest.json` binds nine opaque primary PNG document IDs
TD-001 through TD-009 and nine matching PDF representations. C2 and C3 reference
this exact manifest hash. PDF pages contain the same raster artwork, with no
hidden text layer, and require separately verified provider support. PNG is the
first format; do not substitute reference text or introduce OCR on format failure.
Authoring provenance and separate ground truth stay outside model requests.

From the repository root, using existing pinned npm dependencies:

```sh
node --import tsx --test content/authoring/content.test.ts
```

The tests load the actual content through the frozen ContentService, validate
all envelopes/domain schemas and hashes, independently check source amounts,
recompute wage/withholding ties, grade all 50 deterministic fixtures, verify three
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

The TypeScript intro is complete; each practical starter contains specific TODOs
and throws until completed. Fixture pass means evaluator discrimination, not
agent quality. Policy quality requires a fallible bounded response judge; final
DOUBLE CHECK is a separate nonexecuting review of evaluator code and recorded
results. No transmission or booking capability exists in this content.

`pythonSource` currently embeds the genuine reference-exclusion boundary helper
also saved as `agent_consultation.py`. It explicitly identifies its limited scope.
ET-WP-05/ET-INTEGRATOR must replace the served consultation text with the actual
prepared MAF agent source at integration. The source is not represented as a
working model call. `baseline` is the requested installed variant ID for all cases;
agent instructions and schemas are supplied beside each lesson. No new runtime
package, service export, root command or shared schema change is required.
