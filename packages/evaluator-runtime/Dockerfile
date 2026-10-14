# Build from repository root after npm ci --ignore-scripts. No network in build.
ARG RUNNER_BASE_IMAGE=node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
FROM ${RUNNER_BASE_IMAGE}
COPY --chmod=755 node_modules/typescript/lib /opt/typescript/lib
COPY --chmod=755 packages/evaluator-runtime/worker /opt/worker
USER 65532:65532
WORKDIR /tmp
ENTRYPOINT ["node", "--max-old-space-size=96", "/opt/worker/worker.cjs"]
