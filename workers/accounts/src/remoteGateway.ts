import type { Bindings } from "./env";

export async function remoteDevicePresence(
  env: Bindings,
  deviceIds: string[],
): Promise<{ onlineIds: Set<string>; available: boolean }> {
  if (deviceIds.length === 0) return { onlineIds: new Set(), available: true };
  if (!env.REMOTE_GATEWAY_TOKEN || !env.REMOTE_GATEWAY_ORIGIN) {
    return { onlineIds: new Set(), available: false };
  }
  try {
    const response = await fetch(`${env.REMOTE_GATEWAY_ORIGIN.replace(/\/+$/, "")}/v1/devices/status`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-reasonix-gateway-token": env.REMOTE_GATEWAY_TOKEN,
      },
      body: JSON.stringify({ deviceIds: deviceIds.slice(0, 50) }),
    });
    if (!response.ok) return { onlineIds: new Set(), available: false };
    const data = await response.json<{ devices?: Array<{ id?: string; online?: boolean }> }>();
    const onlineIds = new Set(
      (data.devices ?? []).filter((device) => device.online === true && typeof device.id === "string")
        .map((device) => device.id as string),
    );
    return { onlineIds, available: true };
  } catch {
    return { onlineIds: new Set(), available: false };
  }
}
