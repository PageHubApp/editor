/**
 * Where the CLI finds an API key and a base URL.
 *
 *   key       `PAGEHUB_API_KEY`, else the file `pagehub login` wrote
 *   base URL  `--base-url`, else `PAGEHUB_API_BASE_URL`, else the login file, else https://pagehub.dev
 *
 * The login file is `<config dir>/credentials.json`, mode 0600: `$PAGEHUB_CONFIG_DIR`, else `$XDG_CONFIG_HOME/pagehub`,
 * else `~/.config/pagehub`. The key is never printed, logged or written anywhere else (not into a pulled folder).
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_BASE_URL = "https://pagehub.dev";

export interface Credentials {
  apiKey: string;
  baseUrl?: string;
}

export const configDir = (env: NodeJS.ProcessEnv = process.env): string =>
  env.PAGEHUB_CONFIG_DIR || (env.XDG_CONFIG_HOME ? join(env.XDG_CONFIG_HOME, "pagehub") : join(homedir(), ".config", "pagehub"));

const credentialsFile = (env?: NodeJS.ProcessEnv) => join(configDir(env), "credentials.json");

export function readCredentials(env: NodeJS.ProcessEnv = process.env): Credentials | null {
  try {
    const parsed = JSON.parse(readFileSync(credentialsFile(env), "utf8")) as Partial<Credentials>;
    return typeof parsed.apiKey === "string" && parsed.apiKey ? { apiKey: parsed.apiKey, baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : undefined } : null;
  } catch {
    return null;
  }
}

export function writeCredentials(creds: Credentials, env: NodeJS.ProcessEnv = process.env): string {
  const dir = configDir(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = credentialsFile(env);
  writeFileSync(file, JSON.stringify(creds, null, 2) + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

/** Remove the login file. False when there was none. */
export function clearCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  const file = credentialsFile(env);
  if (!existsSync(file)) return false;
  rmSync(file);
  return true;
}

export const normalizeBaseUrl = (url: string): string => url.trim().replace(/\/+$/, "");

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|[^.]+\.localhost)$/i;

/**
 * The key travels in an `Authorization` header to this URL, so it must be https, or a local development host. Anything
 * else (http to a remote host) would send the key in clear text. `PAGEHUB_ALLOW_INSECURE_BASE_URL=1` opts out.
 */
export function assertSafeBaseUrl(url: string, env: NodeJS.ProcessEnv = process.env): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`"${url}" is not a URL.`);
  }
  if (parsed.protocol === "https:") return;
  if (parsed.protocol === "http:" && (LOCAL_HOST.test(parsed.hostname) || env.PAGEHUB_ALLOW_INSECURE_BASE_URL === "1")) return;
  throw new Error(`Refusing to send an API key to ${parsed.origin} over ${parsed.protocol.replace(":", "")}: use https (http is allowed only for localhost).`);
}

export interface Remote {
  baseUrl: string;
  apiKey: string;
}

/** The base URL and key a command talks with. Throws when there is no key. */
export function resolveRemote({ baseUrl, env = process.env }: { baseUrl?: string; env?: NodeJS.ProcessEnv } = {}): Remote {
  const stored = readCredentials(env);
  const apiKey = env.PAGEHUB_API_KEY || stored?.apiKey;
  if (!apiKey) throw new Error("No API key. Run `pagehub login`, or set PAGEHUB_API_KEY (and PAGEHUB_API_BASE_URL if it isn't https://pagehub.dev).");
  const resolved = normalizeBaseUrl(baseUrl || env.PAGEHUB_API_BASE_URL || stored?.baseUrl || DEFAULT_BASE_URL);
  assertSafeBaseUrl(resolved, env);
  // A saved key is bound to the server it was saved for: a `--base-url` flag, or a base URL remembered in a pulled folder's
  // `.pagehub/state.json`, must not be able to send it somewhere else.
  if (!env.PAGEHUB_API_KEY && stored && resolved !== normalizeBaseUrl(stored.baseUrl || DEFAULT_BASE_URL)) {
    throw new Error(`The saved key is for ${normalizeBaseUrl(stored.baseUrl || DEFAULT_BASE_URL)}, not ${resolved}. Run \`pagehub login --base-url ${resolved}\` or set PAGEHUB_API_KEY for that server.`);
  }
  return { apiKey, baseUrl: resolved };
}
