/**
 * `pagehub login` stores an API key (`ph_…`, from the dashboard's API keys) after checking it works against the server.
 * The key comes from a hidden prompt, or stdin when it is piped (`--key-stdin`); never from a flag, so it stays out of shell
 * history, and it is never printed.
 */
import { createClient } from "./remote/client";
import { assertSafeBaseUrl, clearCredentials, configDir, normalizeBaseUrl, DEFAULT_BASE_URL, readCredentials, writeCredentials } from "./remote/config";

/** Read one line from a TTY without echoing it. */
export function promptHidden(question: string, input: NodeJS.ReadStream = process.stdin, output: NodeJS.WriteStream = process.stdout): Promise<string> {
  return new Promise((resolve, reject) => {
    output.write(question);
    let value = "";
    input.setRawMode?.(true);
    input.resume();
    input.setEncoding("utf8");
    const done = (fn: () => void) => {
      input.setRawMode?.(false);
      input.pause();
      input.removeListener("data", onData);
      output.write("\n");
      fn();
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") return done(() => resolve(value.trim()));
        if (ch === "\u0003") return done(() => reject(new Error("Cancelled.")));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    input.on("data", onData);
  });
}

async function readStdin(input: NodeJS.ReadStream = process.stdin): Promise<string> {
  let text = "";
  input.setEncoding("utf8");
  for await (const chunk of input) text += chunk;
  return text.trim();
}

export interface LoginOptions {
  baseUrl?: string;
  keyStdin?: boolean;
  env?: NodeJS.ProcessEnv;
  /** Where the key comes from; the default is the hidden prompt, or stdin with `keyStdin`. */
  readKey?: () => Promise<string>;
  log?: (line: string) => void;
  fetch?: typeof fetch;
}

export async function login({ baseUrl, keyStdin = false, env = process.env, readKey, log = console.log, fetch: fetchImpl }: LoginOptions = {}): Promise<void> {
  const base = normalizeBaseUrl(baseUrl || env.PAGEHUB_API_BASE_URL || readCredentials(env)?.baseUrl || DEFAULT_BASE_URL);
  assertSafeBaseUrl(base, env);
  const apiKey = await (readKey ?? (keyStdin || !process.stdin.isTTY ? () => readStdin() : () => promptHidden(`API key for ${base}: `)))();
  if (!apiKey) throw new Error("No key given.");
  if (!/^ph_/.test(apiKey)) throw new Error("That doesn't look like a PageHub API key (they start with ph_).");
  const sites = await createClient({ baseUrl: base, apiKey }, fetchImpl).countSites();
  const file = writeCredentials({ apiKey, baseUrl: base }, env);
  log(`Logged in to ${base}: the key works and sees ${sites} site${sites === 1 ? "" : "s"}. Saved to ${file}.`);
}

export function logout({ env = process.env, log = console.log }: { env?: NodeJS.ProcessEnv; log?: (line: string) => void } = {}): void {
  log(clearCredentials(env) ? `Removed the saved key from ${configDir(env)}.` : "No saved key.");
}
