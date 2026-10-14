import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CreatureForm } from "../src/pages/LibraryCreatures";

describe("creature starting HP form (KAN-70)", () => {
  it("prefills wounded and zero HP when saving a token as a creature", () => {
    for (const hp of [30, 0, -4]) {
      const html = renderToStaticMarkup(
        <CreatureForm creature={null} prefill={{
          name: "Ogre", size: 2, hp, maxHp: 59, ac: 11,
          color: "#6d4c41", conditions: ["prone"], imageAssetId: null, imageUrl: null,
        }} onSaved={() => {}} onCancel={() => {}} />,
      );
      expect(html).toContain(`Starting HP<input type="number" min="-999" max="9999" step="1" value="${hp}"`);
      expect(html).toContain('Max HP<input type="number" min="1" max="9999" step="1" value="59"');
      expect(html).not.toContain('type="submit" disabled');
    }
  });
});
