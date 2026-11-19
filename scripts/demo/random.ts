/** Small seeded PRNG (mulberry32) so demo data is reproducible for a given seed. */
export class Rng {
  private state: number;

  constructor(seed: string | number) {
    this.state = typeof seed === "number" ? seed >>> 0 : hashString(seed);
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) throw new Error("pick from empty list");
    return item;
  }

  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [item, w] of items) {
      r -= w;
      if (r < 0) return item;
    }
    const last = items[items.length - 1];
    if (!last) throw new Error("weighted pick from empty list");
    return last[0];
  }

  sample<T>(items: readonly T[], n: number): T[] {
    const copy = [...items];
    const out: T[] = [];
    while (out.length < n && copy.length) {
      out.push(copy.splice(Math.floor(this.next() * copy.length), 1)[0] as T);
    }
    return out;
  }
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
