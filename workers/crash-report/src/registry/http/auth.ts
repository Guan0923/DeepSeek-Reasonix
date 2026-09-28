import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import type { RegistryUser } from "../types";
import { ApiError } from "./errors";

// Resolve identity by asking the account service, forwarding the caller's cookie
// and Authorization so both the web session and the CLI bearer resolve. The
// registry never holds SESSION_PEPPER; accounts stays the sole identity authority.
async function fetchAccountUser(c: Context<AppEnv>): Promise<RegistryUser | null> {
  const cookie = c.req.header("cookie");
  const authz = c.req.header("authorization");
  if (!cookie && !authz) return null;

  const headers: Record<string, string> = {};
  if (cookie) headers["cookie"] = cookie;
  if (authz) headers["authorization"] = authz;

  // Never follow a redirect: the forwarded credentials belong to the accounts
  // origin alone. Only a 401/403 means "not signed in"; any other failure is
  // the identity service's, and saying "sign in" would misname it.
  let res: Response;
  try {
    res = await fetch(`${c.env.ACCOUNTS_ORIGIN}/me`, { headers, redirect: "manual" });
  } catch {
    throw accountsUnavailable();
  }
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw accountsUnavailable();
  const body = (await res.json().catch(() => {
    throw accountsUnavailable();
  })) as {
    user?: { id?: number; handle?: string; role?: string; emailVerified?: boolean };
  };
  const u = body.user;
  if (!u || typeof u.id !== "number" || typeof u.handle !== "string") return null;
  return {
    id: u.id,
    handle: u.handle,
    role: u.role === "admin" ? "admin" : "member",
    emailVerified: u.emailVerified === true,
  };
}

function accountsUnavailable(): ApiError {
  return new ApiError(503, "accounts_unavailable", "The identity service could not be reached. Try again shortly.");
}

// Gate for write routes. Public reads never call this, so list/detail never pay
// the account round-trip.
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await fetchAccountUser(c);
  if (!user) throw new ApiError(401, "unauthorized", "Sign in at id.reasonix.io to publish.");
  c.set("user", user);
  await next();
};

// Gate for moderation routes: a resolved account with the admin role.
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await fetchAccountUser(c);
  if (!user) throw new ApiError(401, "unauthorized", "Sign in at id.reasonix.io.");
  if (user.role !== "admin") throw new ApiError(403, "forbidden", "Admins only.");
  c.set("user", user);
  await next();
};

export function currentUser(c: Context<AppEnv>): RegistryUser {
  return c.get("user");
}
