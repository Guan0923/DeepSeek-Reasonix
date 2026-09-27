import type { RemoteCapability } from "./env";

export const REMOTE_WEBSOCKET_PROTOCOL = "reasonix.remote.v1";
export const REMOTE_AUTH_PROTOCOL_PREFIX = "reasonix.auth.";

export function offeredProtocols(request: Request): string[] {
  return (request.headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export type DeviceMessage =
  | { type: "reply"; to: string; payload: string }
  | { type: "disconnect_controller"; connectionId: string };

export function controllerMessage(
  connectionId: string,
  scopes: RemoteCapability[],
  payload: string,
): string {
  return JSON.stringify({ type: "controller_message", connectionId, scopes, payload });
}

export function controllerPresence(
  type: "controller_connected" | "controller_disconnected",
  connectionId: string,
  scopes: RemoteCapability[],
): string {
  return JSON.stringify({ type, connectionId, scopes });
}

export function parseDeviceMessage(message: string): DeviceMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as Record<string, unknown>;
  if (candidate.type === "disconnect_controller") {
    if (!/^[0-9a-f]{32}$/.test(String(candidate.connectionId ?? ""))) return null;
    return { type: "disconnect_controller", connectionId: String(candidate.connectionId) };
  }
  if (!/^[0-9a-f]{32}$/.test(String(candidate.to ?? ""))) return null;
  if (typeof candidate.payload !== "string") return null;
  return { type: "reply", to: String(candidate.to), payload: candidate.payload };
}
