/**
 * One save at a time. A save requested while one runs queues ONE follow-up: every request made
 * meanwhile joins it (their path lists merge; a request for every dirty file wins) and gets its
 * result. The follow-up starts after the running save settles, failed or not.
 */
export class SaveQueue<R> {
  private running: Promise<R> | null = null;
  private queued: { promise: Promise<R>; paths: Set<string> | null } | null = null;

  constructor(private readonly run: (paths: string[] | undefined) => Promise<R>) {}

  get busy(): boolean {
    return this.running !== null;
  }

  request(paths?: readonly string[]): Promise<R> {
    if (!this.running) return this.start(paths ? [...paths] : undefined);
    if (this.queued) {
      if (!paths) this.queued.paths = null;
      else if (this.queued.paths) for (const p of paths) this.queued.paths.add(p);
      return this.queued.promise;
    }
    const q: { promise: Promise<R>; paths: Set<string> | null } = { paths: paths ? new Set(paths) : null, promise: Promise.resolve(undefined as R) };
    q.promise = this.running.then(
      () => undefined,
      () => undefined,
    ).then(() => {
      this.queued = null;
      return this.start(q.paths ? [...q.paths] : undefined);
    });
    this.queued = q;
    return q.promise;
  }

  private start(paths: string[] | undefined): Promise<R> {
    const p: Promise<R> = this.run(paths).finally(() => {
      if (this.running === p) this.running = null;
    });
    this.running = p;
    return p;
  }
}
