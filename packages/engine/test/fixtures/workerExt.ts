import { defineFilter } from "../../src/runtime/defineFilter.ts";

export const shout = defineFilter({ name: "shout", args: [], returns: "string", describe: "Uppercase.", run: (v) => String(v).toUpperCase() + "!" });
