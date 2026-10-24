import { describe, it, expect } from "vitest";
import {
  demoItems,
  logEntry,
  finishEntry,
  stats,
  percent,
  activityDay,
  rewardProfile,
} from "../src/domain";
describe("prayer and task records", () => {
  it("allows more than 200 rewards and resets at Korean midnight", () => {
    const now = Date.parse("2026-10-21T14:59:59Z");
    const p = {
      uid: "demo",
      name: "모험가",
      xp: 10,
      coins: 2,
      dailyDay: activityDay(now),
      dailyCount: 199,
    };
    const last = rewardProfile(p, 10, 2, now);
    expect(last.dailyCount).toBe(200);
    expect(rewardProfile(last, 10, 2, now).dailyCount).toBe(201);
    const tomorrow = rewardProfile(last, 10, 2, now + 1000);
    expect(tomorrow.dailyCount).toBe(1);
    expect(tomorrow.dailyDay).toBe(last.dailyDay! + 1);
  });
  it("records an activity without mutating the original", () => {
    const original = demoItems[1],
      next = logEntry(original, 10000);
    expect(next.count).toBe(original.count + 1);
    expect(next.myCount).toBe(original.myCount + 1);
    expect(original.lastLog).toBeUndefined();
  });
  it("rejects accidental rapid repeat and completed entries", () => {
    const logged = logEntry(demoItems[1], 10000);
    expect(() => logEntry(logged, 11000)).toThrow();
    expect(logEntry(logged, 13000).count).toBe(logged.count + 1);
    expect(() => logEntry(finishEntry(logged, 5), 14000)).toThrow();
  });
  it("permits all five outcomes and prevents duplicate completion", () => {
    for (let i = 1; i <= 5; i++)
      expect(finishEntry(demoItems[0], i).rating).toBe(i);
    expect(() => finishEntry(demoItems[0], 0)).toThrow();
    expect(() => finishEntry(demoItems[0], 6)).toThrow();
    expect(() => finishEntry(finishEntry(demoItems[0], 5), 5)).toThrow();
  });
  it("averages only fulfilled entries and includes unanswered outcomes in feeling", () => {
    const a = finishEntry({ ...demoItems[0], count: 10 }, 5),
      b = finishEntry({ ...demoItems[1], count: 20 }, 5),
      c = finishEntry({ ...demoItems[2], count: 50 }, 1);
    expect(stats([a, b, c, demoItems[3]])).toEqual({
      done: 3,
      answered: 2,
      average: 15,
      feeling: 67,
    });
    expect(stats([]).average).toBeNull();
    expect(percent(1)).toBe(0);
    expect(percent(5)).toBe(100);
  });
});
