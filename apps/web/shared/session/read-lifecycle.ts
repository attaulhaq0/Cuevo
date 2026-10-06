export type SessionReadFrame = { generation: number; signal: AbortSignal };

/** Browser read cancellation only; this lifecycle never owns authentication or command receipts. */
export class SessionReadLifecycle {
  private controller = new AbortController();
  private generation = 0;
  enabled = true;
  capture(): SessionReadFrame { return { generation: this.generation, signal: this.controller.signal }; }
  isCurrent(frame: SessionReadFrame): boolean { return this.enabled && frame.generation === this.generation && frame.signal === this.controller.signal && !frame.signal.aborted; }
  pause(): number { this.enabled = false; this.controller.abort(); return ++this.generation; }
  resume(ticket: number): boolean {
    if (this.enabled || ticket !== this.generation) return false;
    this.controller = new AbortController(); this.enabled = true; return true;
  }
}
