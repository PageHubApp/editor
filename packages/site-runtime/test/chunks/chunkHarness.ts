import "../setup.ts";

/** Shared fixtures for the chunk tests: chunk config, DOM query helpers, unique state keys, a fake IntersectionObserver. */

export const cfg = { chunkBase: "/c/" };
export const w = window as any;
export const motion = (reduce: boolean) => (w.matchMedia = (q: string) => ({ matches: reduce && q.includes("reduced-motion") }));
export const q = (s: string) => document.querySelector(s) as HTMLElement;
export const mountAll = (m: { mount?: (el: Element, c: any) => void }, sel: string) => document.querySelectorAll(sel).forEach((e) => m.mount!(e, cfg));
let keys = 0;
export const K = () => "k" + ++keys; // state keys are global, so each test gets its own

export class FakeIO {
  static all: FakeIO[] = [];
  observed = new Set<Element>();
  static ever: FakeIO[] = [];
  constructor(public cb: (e: any[]) => void) { FakeIO.all.push(this); FakeIO.ever.push(this); }
  observe(el: Element) { this.observed.add(el); }
  unobserve(el: Element) { this.observed.delete(el); }
  disconnect() {}
}
export const useIO = () => { FakeIO.all = []; w.IntersectionObserver = FakeIO; };
