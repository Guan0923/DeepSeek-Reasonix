import { describe, expect, it } from "vitest";
import { assertSafeTarget, parseArgs, percentile } from "./load-telemetry.mjs";

describe("telemetry capacity probe", () => {
  it("refuses remote and production targets unless separately unlocked", () => {
    const remote = parseArgs(["--target", "https://staging.example.com"]);
    expect(() => assertSafeTarget(remote)).toThrow(/remote target refused/);

    const production = parseArgs(["--target", "https://crash.reasonix.io", "--allow-remote"]);
    expect(() => assertSafeTarget(production)).toThrow(/production target refused/);

    expect(assertSafeTarget(parseArgs([
      "--target", "https://crash.reasonix.io", "--allow-remote", "--allow-production",
    ])).hostname).toBe("crash.reasonix.io");
  });

  it("validates numeric thresholds", () => {
    expect(() => parseArgs(["--requests", "0"])).toThrow(/positive integer/);
    expect(() => parseArgs(["--min-durable-rate", "1.1"])).toThrow(/between 0 and 1/);
  });

  it("uses nearest-rank percentiles", () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(20);
    expect(percentile([40, 10, 30, 20], 0.95)).toBe(40);
  });
});
