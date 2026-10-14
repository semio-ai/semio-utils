import { describe, expect, it } from "vitest";
import { Result } from "./result";
import {
  createErrorReport,
  formatErrorReport,
  toDiagnosticError,
  redactDiagnosticText,
} from "./error-report";

describe("error reports", () => {
  it("preserves native Error fields and structured causes through Result's error branch", () => {
    const cause = Object.assign(new Error("Server unavailable"), { code: "unavailable" });
    const error = Object.assign(new Error("Save failed", { cause }), { kind: "no-response" });
    const result = Result.Err<void, Error>(error);
    const diagnostic = result.mapErr(toDiagnosticError);
    const report = diagnostic.match(
      () => {
        throw new Error("Expected failure");
      },
      (failure) => createErrorReport(failure, { action: "save-project" }, "2026-10-13T12:00:00Z"),
    );
    expect(result.unwrapErr()).toBe(error);
    expect(diagnostic.isErr()).toBe(true);
    expect(report.error.message).toBe("Save failed");
    expect(report.error.stack).toContain("Save failed");
    expect(report.error.causes?.[0]).toMatchObject({
      message: "Server unavailable",
      code: "unavailable",
    });
    expect(JSON.parse(formatErrorReport(report))).toEqual(report);
  });

  it("accepts serializable Rust-style diagnostics without a JavaScript Error", () => {
    const error = {
      message: "Connection failed",
      kind: "transport",
      code: "timeout",
      backtrace: "bridge::connect",
      causes: [{ message: "Device offline" }],
    };
    expect(createErrorReport(error).error).toEqual(error);
    expect(toDiagnosticError({ status: 404, data: "Missing project" })).toMatchObject({
      status: 404,
      message: "Missing project",
    });
  });

  it("excludes arbitrary data, strips URL credentials and query strings, and redacts credential assignments", () => {
    const report = createErrorReport(
      toDiagnosticError({
        message:
          'Request https://user:pass@example.test/path?token=test-only#private failed; token=test-only Bearer test-only "secret":"test-only with spaces"',
        payload: { private: "must not appear" },
      }),
      { route: "/projects/example?token=test-only#private", action: "save" },
    );
    const text = formatErrorReport(report);
    expect(report.context.route).toBe("/projects/example");
    expect(report.error.message).toContain("https://example.test/path");
    expect(text).not.toContain("test-only");
    expect(text).not.toContain("user:pass");
    expect(text).not.toContain("must not appear");
  });

  it("bounds cyclic and oversized errors and tolerates throwing property getters", () => {
    const error: { message: string; cause?: unknown } = { message: "x".repeat(10000) };
    error.cause = error;
    const normalized = toDiagnosticError(error);
    expect(normalized.message.length).toBeLessThanOrEqual(4096);
    expect(normalized.causes?.[0]?.message).toBe("[circular cause]");
    expect(
      toDiagnosticError({
        get message() {
          throw new Error("Invalid getter");
        },
      }).message,
    ).toBe("Unknown error");
  });
  it("redacts prefixed credential assignments, Basic authorization and bridge URL parameters", () => {
    const text = redactDiagnosticText(
      "access_token=test-only refresh_token=test-only id_token=test-only clientSecret=test-only appSecret=test-only\nAuthorization: Basic test-only\nwss://user:pass@example.test/bridge?key=test-only#private",
    );
    expect(text).not.toContain("test-only");
    expect(text).not.toContain("user:pass");
    expect(text).toContain("wss://example.test/bridge");
  });

  it("bounds aggregate diagnostic text, handles repeated causes and ignores null causes", () => {
    const shared = { message: "Repeated" };
    expect(toDiagnosticError({ message: "Root", causes: [shared, shared] }).causes).toEqual([
      shared,
      shared,
    ]);
    expect(toDiagnosticError({ message: "Root", cause: null }).causes).toBeUndefined();
    const branch = () => ({
      message: "m".repeat(4096),
      stack: "s".repeat(16384),
      backtrace: "b".repeat(16384),
    });
    const normalized = toDiagnosticError({
      ...branch(),
      causes: Array.from({ length: 8 }, branch),
    });
    expect(JSON.stringify(normalized).length).toBeLessThan(68000);
  });
  it("redacts quoted values when a diagnostic string limit cuts off the closing quote", () => {
    const error = toDiagnosticError({ message: `token="first ${"test-only ".repeat(1000)}"` });
    expect(error.message).toBe("token=[redacted]");
  });
});
