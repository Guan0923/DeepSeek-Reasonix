import { Hono } from "hono";
import type { AppEnv } from "../env";
import { toPackageDTO } from "../types";
import { repos } from "../db";
import { requireAuth, currentUser } from "../http/auth";
import { writeRateLimit } from "../http/ratelimit";
import { ApiError } from "../http/errors";
import { parseQuery, VersionQuerySchema } from "../lib/validation";

const me = new Hono<AppEnv>();

const MINE_LIMIT = 200;

const now = () => new Date().toISOString();

// Another publisher's package and a missing one answer identically.
const notFound = () => new ApiError(404, "not_found", "No such package.");

// The publisher's own submissions, including the pending, rejected and hidden
// ones the public listing never serves, so a submitter can see where review stands.
me.get("/packages", requireAuth, async (c) => {
  const rows = await repos(c.env).packages.listByPublisher(currentUser(c).id, MINE_LIMIT);
  return c.json({ packages: rows.map(toPackageDTO) });
});

// The owner's view of one package in any state, which is what lets a publisher
// install their own unreviewed or private package.
me.get("/packages/:handle/:name", requireAuth, async (c) => {
  const slug = `${c.req.param("handle")}/${c.req.param("name")}`;
  const page = parseQuery(c, VersionQuerySchema);
  const { packages: repo } = repos(c.env);
  const row = await repo.ownedBySlug(slug, currentUser(c).id);
  if (!row) throw notFound();
  const versions = await repo.versions(row.id, page);
  return c.json({ package: toPackageDTO(row), ...versions });
});

me.post("/packages/:handle/:name/submit", writeRateLimit, requireAuth, async (c) => {
  const slug = `${c.req.param("handle")}/${c.req.param("name")}`;
  const user = currentUser(c);
  const { packages: repo } = repos(c.env);
  const row = await repo.submitPrivate(slug, user.id, now());
  if (row) return c.json({ package: toPackageDTO(row) });
  if (!(await repo.ownedBySlug(slug, user.id))) throw notFound();
  throw new ApiError(409, "not_private", "Only a private package can be submitted for review.");
});

export default me;
