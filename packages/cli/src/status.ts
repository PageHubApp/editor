/** `pagehub status [dir]`: what changed here and on the server since the last pull or push. Reads only; changes nothing. */
import { relative, resolve } from "node:path";
import type { Client } from "./remote/client";
import { compare, hasChanges, plural, type Comparison, type SideChanges } from "./remote/compare";
import { requireState } from "./remote/state";

export interface StatusOptions {
  client: Client;
  dir: string;
  log?: (line: string) => void;
}

const lines = (c: SideChanges): string[] => [
  ...c.modified.map((p) => `  M  ${p}`),
  ...c.added.map((p) => `  A  ${p}`),
  ...c.deleted.map((p) => `  D  ${p}`),
];

export async function status({ client, dir: dirArg, log = console.log }: StatusOptions): Promise<Comparison> {
  const dir = resolve(dirArg);
  const state = requireState(dir);
  const cmp = compare(dir, state, await client.listFiles(state.siteId));
  log(`${state.siteId} at ${state.baseUrl}, folder ${relative(process.cwd(), dir) || "."}, synced ${state.syncedAt || "never"}`);
  if (hasChanges(cmp.local)) log(`\nChanged here (\`pagehub push\` sends ${plural(cmp.local.modified.length + cmp.local.added.length + cmp.local.deleted.length, "file")}):\n${lines(cmp.local).join("\n")}`);
  if (hasChanges(cmp.remote)) log(`\nChanged on the server (\`pagehub pull\` fetches ${plural(cmp.remote.modified.length + cmp.remote.added.length + cmp.remote.deleted.length, "file")}):\n${lines(cmp.remote).join("\n")}`);
  if (cmp.conflicts.length) log(`\nChanged on both sides (push refuses these; pull keeps yours and writes the server's copy to .pagehub/theirs):\n${cmp.conflicts.map((p) => `  !  ${p}`).join("\n")}`);
  if (cmp.misnamed.length) log(`\nNot pushable (the server would refuse the name):\n${cmp.misnamed.map((p) => `  ?  ${p}`).join("\n")}`);
  if (!hasChanges(cmp.local) && !hasChanges(cmp.remote)) log("\nUp to date.");
  return cmp;
}
