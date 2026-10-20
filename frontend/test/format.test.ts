import { describe, expect, it } from "vitest";
import { formatBig, shorten } from "@/lib/format";

describe("shorten", () => {
  it("keeps short values as they are", () => {
    expect(shorten("0x1234")).toBe("0x1234");
    expect(shorten("")).toBe("");
  });

  it("keeps the head and the tail of long values", () => {
    const shortened = shorten("0xabcdef0123456789abcdef0123456789");
    expect(shortened.startsWith("0xabcdef…")).toBe(true);
    expect(shortened.endsWith("…456789")).toBe(true);
  });

  it("honours the requested size", () => {
    const shortened = shorten("0xabcdef0123456789", 4);
    expect(shortened).toBe("0xabcd…6789");
  });
});

describe("formatBig", () => {
  it("keeps values that fit", () => {
    expect(formatBig(42n)).toBe("42");
  });

  it("truncates long numbers in the middle", () => {
    const formatted = formatBig(123456789012345678901234567890n, 4);
    expect(formatted.startsWith("1234")).toBe(true);
    expect(formatted.endsWith("7890")).toBe(true);
  });
});
