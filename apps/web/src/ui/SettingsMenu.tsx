import { useId, type CSSProperties } from "react";
import { Modal } from "./Modal";
import { setClientSettings, useClientSettings, type GraphicsQuality } from "./clientSettings";

export function SettingsMenu({ open, onClose, onAfterClose }: { open: boolean; onClose: () => void; onAfterClose?: () => void }) {
  const settings = useClientSettings();
  return (
    <Modal open={open} title="Settings" className="client-settings-modal" onClose={onClose} onAfterClose={onAfterClose}>
      <div className="stack client-settings">
        <p className="muted small-print">Saved in this browser. Changes apply immediately.</p>
        <fieldset className="stack settings-section">
          <legend>Audio</legend>
          <VolumeSlider label="Music volume" value={settings.musicVolume} onChange={(musicVolume) => setClientSettings({ musicVolume })} />
          <VolumeSlider label="Sound effects volume" value={settings.soundVolume} onChange={(soundVolume) => setClientSettings({ soundVolume })} />
        </fieldset>
        <fieldset className="stack settings-section">
          <legend>Graphics</legend>
          <label>Graphics quality
            <select value={settings.graphicsQuality} onChange={(e) => setClientSettings({ graphicsQuality: e.target.value as GraphicsQuality })}>
              <option value="high">High</option>
              <option value="balanced">Balanced</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="checkbox">
            <input type="checkbox" role="switch" checked={settings.reducedAnimations} onChange={(e) => setClientSettings({ reducedAnimations: e.target.checked })} />
            Reduced animations
          </label>
          <p className="muted small-print">Still effects instead of moving ones.</p>
          <label className="checkbox">
            <input type="checkbox" role="switch" checked={settings.autoFocusAttacks} onChange={(e) => setClientSettings({ autoFocusAttacks: e.target.checked })} />
            Focus on attacks
          </label>
          <p className="muted small-print">Zoom the board to the fight.</p>
        </fieldset>
        <div className="row settings-actions"><button type="button" onClick={onClose}>Done</button></div>
      </div>
    </Modal>
  );
}
function VolumeSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const id = useId();
  return (
    <div className="range-field settings-volume">
      <div className="range-label">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="range-value">{value}%</output>
      </div>
      <input id={id} className="range" type="range" min="0" max="100" step="1"
        value={value} aria-valuetext={`${value} percent`}
        style={{ "--range-progress": `${value}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
