const API = (import.meta.env.PUBLIC_ACCOUNTS_API || "https://id.reasonix.io").replace(/\/$/, "");
const RELAY = (import.meta.env.PUBLIC_REMOTE_GATEWAY || "wss://remote.reasonix.io").replace(/\/$/, "");
const $ = (id) => document.getElementById(id);
const local = (en, zh) => document.body.dataset.lang === "zh" ? zh : en;

async function api(path, options = {}) {
  const response = await fetch(API + path, {
    credentials: "include",
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(data?.error?.message || local("The request failed.", "请求失败。"));
    error.status = response.status;
    throw error;
  }
  return data;
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64ToBytes(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptedChannel(device, socket) {
  const pair = await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
  const deviceKey = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(device.publicKey),
    { name: "X25519" },
    false,
    [],
  );
  const secret = await crypto.subtle.deriveBits({ name: "X25519", public: deviceKey }, pair.privateKey, 256);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  const info = new TextEncoder().encode(`reasonix-remote-v1|${device.id}`);
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  socket.send(JSON.stringify({
    v: 1,
    type: "hello",
    publicKey: bytesToBase64(publicKey),
    salt: bytesToBase64(salt),
  }));
  return {
    async seal(value) {
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      const plain = new TextEncoder().encode(JSON.stringify(value));
      const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: info }, key, plain);
      return JSON.stringify({ v: 1, nonce: bytesToBase64(nonce), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) });
    },
    async open(payload) {
      const envelope = JSON.parse(payload);
      if (envelope.v !== 1) throw new Error(local("Unsupported encryption version.", "不支持的加密版本。"));
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64ToBytes(envelope.nonce), additionalData: info },
        key,
        base64ToBytes(envelope.ciphertext),
      );
      return JSON.parse(new TextDecoder().decode(plain));
    },
  };
}

function openSocket(ticket) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${RELAY}/v1/sessions/connect`, ["reasonix.remote.v1", `reasonix.auth.${ticket}`]);
    const timer = window.setTimeout(() => {
      socket.close();
      reject(new Error(local("The connection timed out.", "连接超时。")));
    }, 10000);
    socket.addEventListener("open", () => {
      window.clearTimeout(timer);
      resolve(socket);
    }, { once: true });
    socket.addEventListener("error", () => {
      window.clearTimeout(timer);
      reject(new Error(local("The relay connection failed.", "无法连接中转服务。")));
    }, { once: true });
  });
}

function nextMessage(socket, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(local("Studio did not respond. Make sure it is open and signed in.", "Studio 没有响应，请确认它已打开并登录。")));
    }, timeout);
    const cleanup = () => {
      window.clearTimeout(timer);
      socket.removeEventListener("message", receive);
      socket.removeEventListener("close", closed);
    };
    const receive = (event) => { cleanup(); resolve(String(event.data)); };
    const closed = () => { cleanup(); reject(new Error(local("The connection closed.", "连接已断开。"))); };
    socket.addEventListener("message", receive);
    socket.addEventListener("close", closed);
  });
}

async function probe(device, button, result) {
  button.disabled = true;
  result.dataset.state = "busy";
  result.textContent = local("Connecting…", "正在连接…");
  let socket;
  try {
    if (!device.publicKey || base64ToBytes(device.publicKey).length !== 32) {
      throw new Error(local("Update Reasonix Studio on this device before connecting.", "请先更新这台设备上的 Reasonix Studio。"));
    }
    const issued = await api("/me/remote-grants", {
      method: "POST",
      body: { targetDeviceId: device.id, scopes: ["tasks"] },
    });
    socket = await openSocket(issued.grant.ticket);
    const readyWire = nextMessage(socket);
    const channel = await encryptedChannel(device, socket);
    const ready = await channel.open(await readyWire);
    if (ready.type !== "ready" || ready.deviceId !== device.id) throw new Error(local("Studio identity did not match.", "Studio 身份校验不一致。"));
    const id = crypto.randomUUID();
    const started = performance.now();
    const pongWire = nextMessage(socket);
    socket.send(await channel.seal({ v: 1, type: "ping", id }));
    const pong = await channel.open(await pongWire);
    if (pong.type !== "pong" || pong.id !== id) throw new Error(local("Studio returned an invalid response.", "Studio 返回了无效响应。"));
    const latency = Math.max(1, Math.round(performance.now() - started));
    result.dataset.state = "ok";
    result.textContent = local(
      `Connected securely · ${ready.platform} · Studio ${ready.version} · ${latency} ms`,
      `已安全连接 · ${ready.platform} · Studio ${ready.version} · ${latency} 毫秒`,
    );
  } catch (error) {
    result.dataset.state = "error";
    result.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    socket?.close();
    button.disabled = false;
  }
}

function deviceCard(device) {
  const card = document.createElement("article");
  card.className = "remote-device";
  const head = document.createElement("div");
  head.className = "remote-device-head";
  const identity = document.createElement("div");
  const name = document.createElement("h2");
  name.textContent = device.name || local("Unnamed Studio", "未命名的 Studio");
  const meta = document.createElement("p");
  const seen = device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : local("Never connected", "尚未连接");
  meta.textContent = `${device.platform || "unknown"} · ${local("Last seen", "最近连接")} ${seen}`;
  identity.append(name, meta);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-dark";
  button.textContent = local("Test secure connection", "测试安全连接");
  head.append(identity, button);
  const result = document.createElement("p");
  result.className = "remote-result";
  result.setAttribute("role", "status");
  card.append(head, result);
  button.addEventListener("click", () => probe(device, button, result));
  return card;
}

const gate = $("remote-gate");
const view = $("remote-view");
const list = $("remote-devices");
const box = $("remote-msg");

Promise.all([api("/me"), api("/me/devices")])
  .then(([, data]) => {
    gate.hidden = true;
    view.hidden = false;
    const devices = (data.devices || []).filter((device) => !device.revokedAt);
    if (devices.length === 0) {
      box.className = "auth-msg ok";
      box.textContent = local("No Studio device is registered yet. Open Studio and sign in with this account.", "还没有已注册的 Studio 设备，请打开 Studio 并使用当前账号登录。");
      box.hidden = false;
      return;
    }
    devices.forEach((device) => list.append(deviceCard(device)));
  })
  .catch((error) => {
    if (error.status === 401) {
      location.href = `/login/?next=${encodeURIComponent("/remote/")}`;
      return;
    }
    gate.className = "auth-msg error";
    gate.textContent = error.message;
  });
