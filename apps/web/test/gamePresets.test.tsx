import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GAME_PRESETS, presetOf, type Token } from "@vtt/shared";
import { TokenEditor } from "../src/panels/TokenRoster";

const token: Token = {
  id: "t1", name: "Goblin", position: { x: 35, y: 35 }, size: 1, rotation: 0, color: "#336699", imageUrl: null,
  assetId: null, ownerIds: [], hidden: false, stats: { hp: 7, maxHp: 7, ac: null }, conditions: [],
};

const OFF = { attacks: false, conditions: false, armorClass: false };
const editor = (features = presetOf({ preset: "free" }).features) => renderToStaticMarkup(
  <TokenEditor token={token} roomToken="r" isGm players={[]} departedOwner={null} error={null}
    features={features} onSave={async () => {}} onDelete={() => {}} />,
);

describe("Game presets in the room (KAN-63)", () => {
  it("hides AC and Conditions in the token editor when a preset turns them off", () => {
    const html = editor(OFF);
    expect(html).toContain("HP<input");
    expect(html).not.toContain("AC<input");
    expect(html).not.toContain("Conditions");
  });

  it("keeps them in Free Mode", () => {
    const html = editor();
    expect(html).toContain("AC<input");
    expect(html).toContain("Conditions");
  });

  it("names every preset in text for the form and the badge", () => {
    for (const preset of GAME_PRESETS) {
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
    }
    expect(presetOf({ preset: "free" }).name).toBe("Free Mode");
  });
});
