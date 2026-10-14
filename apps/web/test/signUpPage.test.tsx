// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PASSWORD_MAX, PASSWORD_MIN } from "@vtt/shared";
import { accountStore } from "../src/account/accountStore";
import { SignUpPage } from "../src/account/AccountPages";

afterEach(() => {
  cleanup();
  accountStore.setState({ status: "loading" });
});

describe("sign-up password hint (FR-GM-01)", () => {
  it("states only the length limits", () => {
    accountStore.setState({ status: "signedOut" });
    render(<SignUpPage />);
    expect(screen.getByText(`${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`)).toBeTruthy();
    expect(document.body.textContent).not.toContain("A few words");
  });
});
