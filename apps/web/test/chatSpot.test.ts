import { describe, expect, it } from "vitest";
import { clampChatSpot } from "../src/panels/ChatPanel";

describe("moving the chat button (KAN-75)", () => {
  it("keeps a spot inside the window as it is", () => {
    expect(clampChatSpot({ right: 200, bottom: 300 }, 1400, 900)).toEqual({ right: 200, bottom: 300 });
  });

  it("keeps the whole button and its margin on screen past any edge", () => {
    // 52 px button, 16 px margin: right and bottom stay between 16 and size - 68.
    expect(clampChatSpot({ right: -50, bottom: -50 }, 1400, 900)).toEqual({ right: 16, bottom: 16 });
    expect(clampChatSpot({ right: 5000, bottom: 5000 }, 1400, 900)).toEqual({ right: 1332, bottom: 832 });
  });

  it("pulls a spot saved on a wide screen back onto a phone", () => {
    expect(clampChatSpot({ right: 1200, bottom: 700 }, 390, 780)).toEqual({ right: 322, bottom: 700 });
  });
});
