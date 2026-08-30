import { describe, expect, it } from "vitest";

import { errorDetails } from "@shared/observability/error-details";

describe("errorDetails", () => {
  it("preserves diagnostics and nested causes from Error instances", () => {
    const cause = Object.assign(new Error("D1 unavailable"), {
      code: "SQLITE_BUSY",
    });
    const error = new TypeError("Could not start lobby", { cause });

    expect(errorDetails(error)).toMatchObject({
      cause: { code: "SQLITE_BUSY", message: "D1 unavailable", name: "Error" },
      message: "Could not start lobby",
      name: "TypeError",
      stack: expect.stringContaining("Could not start lobby"),
    });
  });

  it("describes values thrown without Error wrappers", () => {
    expect(errorDetails({ reason: "broken" })).toEqual({
      message: '{"reason":"broken"}',
      name: "NonErrorThrown",
    });
  });
});
