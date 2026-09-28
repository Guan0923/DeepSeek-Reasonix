import { PackageRepo } from "./db/packages";
import { EventRepo, pinSummary } from "./db/events";
import type { PackageRow } from "./types";

export interface PinRequest {
  slug: string;
  expectedVersion: string;
  expectedUpdatedAt: string;
  contentHash: string;
  actor: string;
  now: string;
}

// Rebinds a live package's reviewed digest and logs who changed it, when, and
// from what. Null means the package is not the live revision the admin saw.
export async function repinReviewedDigest(
  db: D1Database,
  req: PinRequest,
): Promise<{ row: PackageRow; previous: string } | null> {
  const result = await new PackageRepo(db).repinIfCurrent(
    req.slug,
    req.expectedVersion,
    req.expectedUpdatedAt,
    req.contentHash,
  );
  if (!result) return null;
  await new EventRepo(db).log({
    type: "pin",
    packageId: result.row.id,
    actorHandle: req.actor,
    summary: pinSummary(req.expectedVersion, result.previous, req.contentHash),
    now: req.now,
  });
  return result;
}
