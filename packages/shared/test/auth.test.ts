import { describe, expect, it } from "vitest";
import { ChangePasswordRequest, SignInRequest, SignUpRequest } from "../src";

const valid = { email: "sam@example.com", password: "correct horse", displayName: "Sam" };

/** The field a failed parse names, so a 400 can say which input was wrong. */
const failedField = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.success ? null : result.error!.issues[0]!.path[0];

describe("user accounts (FR-GM-01)", () => {
  describe("sign-up", () => {
    it("trims and lowercases the email, so case and spaces never make a second account", () => {
      const parsed = SignUpRequest.parse({ ...valid, email: "  Sam@Example.COM " });
      expect(parsed.email).toBe("sam@example.com");
    });

    it("accepts an email of 254 characters and refuses 255", () => {
      const at254 = `${"a".repeat(242)}@example.com`;
      expect(at254).toHaveLength(254);
      expect(SignUpRequest.safeParse({ ...valid, email: at254 }).success).toBe(true);
      expect(failedField(SignUpRequest.safeParse({ ...valid, email: `a${at254}` }))).toBe("email");
    });

    it("refuses something that is not an email address", () => {
      for (const email of ["sam", "sam@", "@example.com", "sam @example.com"]) {
        expect(failedField(SignUpRequest.safeParse({ ...valid, email }))).toBe("email");
      }
    });

    it("accepts passwords of 8 and 128 characters and refuses 7 and 129", () => {
      expect(SignUpRequest.safeParse({ ...valid, password: "x".repeat(8) }).success).toBe(true);
      expect(SignUpRequest.safeParse({ ...valid, password: "x".repeat(128) }).success).toBe(true);
      expect(failedField(SignUpRequest.safeParse({ ...valid, password: "x".repeat(7) }))).toBe("password");
      expect(failedField(SignUpRequest.safeParse({ ...valid, password: "x".repeat(129) }))).toBe("password");
    });

    it("has no composition rule beyond length", () => {
      expect(SignUpRequest.safeParse({ ...valid, password: "aaaaaaaa" }).success).toBe(true);
    });

    it("refuses a password equal to the email, in any case", () => {
      expect(failedField(SignUpRequest.safeParse({ ...valid, password: "sam@example.com" }))).toBe("password");
      expect(failedField(SignUpRequest.safeParse({ ...valid, password: "SAM@Example.com" }))).toBe("password");
    });

    it("trims the display name and refuses a blank or over-long one", () => {
      expect(SignUpRequest.parse({ ...valid, displayName: "  Sam  " }).displayName).toBe("Sam");
      expect(failedField(SignUpRequest.safeParse({ ...valid, displayName: "   " }))).toBe("displayName");
      expect(failedField(SignUpRequest.safeParse({ ...valid, displayName: "x".repeat(41) }))).toBe("displayName");
    });
  });

  describe("sign-in", () => {
    it("normalises the email the same way as sign-up", () => {
      expect(SignInRequest.parse({ email: " SAM@example.com", password: "x" }).email).toBe("sam@example.com");
    });

    it("checks only the password's presence and bound, never its rules", () => {
      expect(SignInRequest.safeParse({ email: "sam@example.com", password: "short" }).success).toBe(true);
      expect(SignInRequest.safeParse({ email: "sam@example.com", password: "" }).success).toBe(false);
      expect(SignInRequest.safeParse({ email: "sam@example.com", password: "x".repeat(129) }).success).toBe(false);
    });
  });

  describe("change password", () => {
    it("holds the new password to the sign-up rules", () => {
      expect(ChangePasswordRequest.safeParse({ currentPassword: "old", newPassword: "x".repeat(8) }).success).toBe(true);
      expect(failedField(ChangePasswordRequest.safeParse({ currentPassword: "old", newPassword: "short" }))).toBe(
        "newPassword",
      );
    });
  });
});
