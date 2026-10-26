/**
 * The role gate for commands: a command "can run" only if every transaction it would
 * dispatch passes the `before` hooks (content mode, read-only). The command runs against a host
 * whose `dispatch` only checks, so nothing is applied; commands that dispatch nothing (UI
 * toggles, selection-only effects) always pass. `canRun`, `runCommand` and the keymap consult it
 * through `CommandHost.probe`, so every UI that greys out on `can()` follows.
 */
import { runBefore } from "../normalize/hooks";
import { runCommand, type Command, type CommandHost } from "../commands/defineCommand";

export function probeCommand(host: CommandHost, cmd: Command<any>, args: unknown): boolean {
  let allowed = true;
  const check: CommandHost = {
    get state() {
      return host.state;
    },
    ui: host.ui,
    registry: host.registry,
    dispatch: (tr) => {
      if ("veto" in runBefore(host.state, tr)) allowed = false;
    },
  };
  return runCommand(check, cmd, args) && allowed;
}
