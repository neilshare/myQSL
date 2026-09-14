export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  constructor(private readonly limit = 100) {}
  push(value: T): void { this.past.push(value); if (this.past.length > this.limit) this.past.shift(); this.future = []; }
  undo(current: T): T { const previous = this.past.pop(); if (previous === undefined) return current; this.future.push(current); return previous; }
  redo(current: T): T { const next = this.future.pop(); if (next === undefined) return current; this.past.push(current); return next; }
  get size(): number { return this.past.length; }
}
