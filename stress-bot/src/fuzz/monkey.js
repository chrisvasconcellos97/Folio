// Drives the fuzz layer. Picks a random strategy each tick, runs it,
// pauses a random interval, and stops when durationMs elapses.

import { strategies } from "./strategies.js";
import { pickWeighted, randInt, sleep } from "../lib/retry.js";

export async function runFuzz(page, adapter, opts, onIssue) {
  const stopAt = Date.now() + opts.durationMs;
  let ticks = 0;
  while (Date.now() < stopAt) {
    const name = pickWeighted(opts.strategies);
    const fn = strategies[name];
    if (!fn) continue;
    try {
      await fn(page, adapter);
    } catch (e) {
      onIssue({ kind: "fuzz-strategy-error", message: `${name}: ${e.message}` });
    }
    ticks++;
    await sleep(randInt(opts.minDelayMs, opts.maxDelayMs));
  }
  return { ticks };
}
