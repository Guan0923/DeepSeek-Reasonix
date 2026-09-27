import type { Env } from "./env";

export type ClientSurfaceName = "desktop" | "studio" | "cli";

type TelemetryDatabaseEnv = Pick<
  Env,
  "DB" | "TELEMETRY_DB" | "TELEMETRY_DB_MODE" | "DESKTOP_TELEMETRY_DB_MODE"
>;

export function telemetryDatabase(env: TelemetryDatabaseEnv, surface: ClientSurfaceName): D1Database {
  const mode = surface === "desktop" ? env.DESKTOP_TELEMETRY_DB_MODE : env.TELEMETRY_DB_MODE;
  if (mode !== "isolated") return env.DB;
  return env.TELEMETRY_DB ?? env.DB;
}

export function telemetryWriteDatabases(env: TelemetryDatabaseEnv, surface: ClientSurfaceName): D1Database[] {
  if (!env.TELEMETRY_DB) return [env.DB];
  const mode = surface === "desktop" ? env.DESKTOP_TELEMETRY_DB_MODE : env.TELEMETRY_DB_MODE;
  if (mode === "dual") return [env.DB, env.TELEMETRY_DB];
  if (mode === "isolated") return [env.TELEMETRY_DB];
  return [env.DB];
}
