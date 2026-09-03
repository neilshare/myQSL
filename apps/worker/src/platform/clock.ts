export interface ClockPort {
  now(): number;
}

export const Clock: ClockPort = { now: () => Date.now() };

export function fixedClock(timestamp: number): ClockPort {
  return { now: () => timestamp };
}
