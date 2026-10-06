export type DependencyReadiness = { database: boolean; authentication: boolean };
export class ReadinessProbe {
  private current: Promise<DependencyReadiness> | undefined;
  private cached: { value: DependencyReadiness; expires: number } | undefined;
  constructor(private readonly probe: () => Promise<DependencyReadiness>, private readonly now = Date.now) {}
  async check(): Promise<DependencyReadiness> {
    if (this.cached && this.cached.expires > this.now()) return { ...this.cached.value };
    if (!this.current) this.current = Promise.resolve().then(this.probe)
      .catch(() => ({ database: false, authentication: false }))
      .then(value => { this.cached = { value, expires: this.now() + 2000 }; return value; })
      .finally(() => { this.current = undefined; });
    return { ...await this.current };
  }
}
