import { Hono } from "hono";
import type { AppEnv } from "../env";
import { toPackageDTO } from "../types";
import { repos } from "../db";
import { requireAuth, currentUser } from "../http/auth";

const me = new Hono<AppEnv>();

const MINE_LIMIT = 200;

// The publisher's own submissions, including the pending, rejected and hidden
// ones the public listing never serves, so a submitter can see where review stands.
me.get("/packages", requireAuth, async (c) => {
  const rows = await repos(c.env).packages.listByPublisher(currentUser(c).id, MINE_LIMIT);
  return c.json({ packages: rows.map(toPackageDTO) });
});

export default me;
