// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LineWidthField } from "../src/ui/ToolRail";

afterEach(cleanup);

function Harness({ start = 1 }: { start?: number }) {
  const [cells, setCells] = useState(start);
  return (
    <>
      <LineWidthField value={cells} onChange={setCells} />
      <output data-testid="cells">{cells}</output>
    </>
  );
}

const field = () => screen.getByRole("spinbutton", { name: "Line width" }) as HTMLInputElement;
const cells = () => screen.getByTestId("cells").textContent;

describe("line width control (FR-TAC-06, aoe-tool-refinements)", () => {
  it("steps by one square with the buttons", () => {
    render(<Harness />);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Wider" }));
    expect(field().value).toBe("4");
    expect(cells()).toBe("4");
    fireEvent.click(screen.getByRole("button", { name: "Narrower" }));
    expect(cells()).toBe("3");
  });

  it("keeps a typed width within 1 to 10 squares, as a whole number", () => {
    render(<Harness />);
    fireEvent.change(field(), { target: { value: "14" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(field().value).toBe("10");
    expect(cells()).toBe("10");
    fireEvent.change(field(), { target: { value: "0" } });
    fireEvent.blur(field());
    expect(cells()).toBe("1");
    fireEvent.change(field(), { target: { value: "2.6" } });
    fireEvent.blur(field());
    expect(cells()).toBe("3");
  });

  it("goes back to the last width when the field is cleared", () => {
    render(<Harness start={3} />);
    fireEvent.change(field(), { target: { value: "" } });
    fireEvent.blur(field());
    expect(field().value).toBe("3");
    expect(cells()).toBe("3");
  });

  it("disables Narrower at 1 square and Wider at 10", () => {
    const { unmount } = render(<Harness start={1} />);
    expect(screen.getByRole("button", { name: "Narrower" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Wider" })).toHaveProperty("disabled", false);
    unmount();
    render(<Harness start={10} />);
    expect(screen.getByRole("button", { name: "Wider" })).toHaveProperty("disabled", true);
  });
});
