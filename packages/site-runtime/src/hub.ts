export interface Hub {
  fns: Record<string, (event: Event, el: Element) => void>;
  on(name: string, fn: (event: Event, el: Element) => void): void;
}

/** The `PageHub` global the site's own script registers functions on (`PageHub.on("openChat", fn)`). Created by core so a script that runs first still finds it. */
export function hub(win: Window): Hub {
  const w = win as unknown as { PageHub?: Hub };
  return (w.PageHub ??= {
    fns: {},
    on(name, fn) {
      this.fns[name] = fn;
    },
  });
}
