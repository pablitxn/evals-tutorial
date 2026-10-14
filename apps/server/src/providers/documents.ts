import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { validateContract } from '@evals-tutorial/contracts';
import type { DocumentManifest, DocumentManifestRef, ResolvedDocument } from '@evals-tutorial/contracts';
import { sha256 } from '@evals-tutorial/contracts/node';
import { operation } from './process.js';

/** Host helper for runner wiring. Never accept a manifest path from evaluator RPC. */
export async function resolveAgentDocuments(contentRoot: string, manifestRef: DocumentManifestRef, documentIds: readonly string[]): Promise<ResolvedDocument[]> {
  if (!validateContract('DocumentManifestRef', manifestRef).valid || documentIds.length > 8 || new Set(documentIds).size !== documentIds.length) throw operation('invalid_request', 'Invalid trusted document selection.');
  const root = await realpath(contentRoot);
  async function ownedPath(path: string) {
    const absolute = await realpath(resolve(root, path));
    const rel = relative(root, absolute);
    if (rel.startsWith('..') || isAbsolute(rel)) throw operation('invalid_request', 'Document manifest path leaves the content root.');
    return absolute;
  }
  const manifestPath = await ownedPath(manifestRef.path);
  const info = await stat(manifestPath);
  if (!info.isFile() || info.size > 1048576) throw operation('resource_limit', 'Invalid or oversized document manifest.');
  const bytes = await readFile(manifestPath);
  if (sha256(bytes) !== manifestRef.sha256) throw operation('source_stale', 'Document manifest changed.');
  const manifest = JSON.parse(bytes.toString('utf8')) as DocumentManifest;
  if (!validateContract('DocumentManifest', manifest).valid) throw operation('invalid_request', 'Invalid document manifest.');
  const result: ResolvedDocument[] = [];
  for (const id of documentIds) {
    const matches = manifest.documents.filter(document => document.id === id);
    if (matches.length !== 1) throw operation('not_found', 'Synthetic document ID is absent or ambiguous.');
    const doc = matches[0]!;
    result.push({ id: doc.id, absolutePath: await ownedPath(doc.path), sha256: doc.sha256, mimeType: doc.mimeType });
  }
  return result;
}
