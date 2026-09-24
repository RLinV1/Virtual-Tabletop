import { createContext, useContext, useId, type ReactNode } from "react";
import { isBooleanRecord, usePersistentState } from "./usePersistentState";

/**
 * Collapse state for every side-panel section, one record per browser (room-sidebar-layout).
 * UI-only: it never touches room state, so there is nothing to send or filter.
 */
interface SectionCollapse {
  isCollapsed(id: string): boolean;
  toggle(id: string): void;
}

const SectionCollapseContext = createContext<SectionCollapse>({
  isCollapsed: () => false,
  toggle: () => {},
});

export function SectionCollapseProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = usePersistentState<Record<string, boolean>>("vtt.ui.sections", {}, isBooleanRecord);
  const value: SectionCollapse = {
    isCollapsed: (id) => collapsed[id] === true,
    toggle: (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] })),
  };
  return <SectionCollapseContext.Provider value={value}>{children}</SectionCollapseContext.Provider>;
}

interface Props {
  /** Stable key for the remembered collapse state, e.g. "dice". */
  id: string;
  title: ReactNode;
  children: ReactNode;
}

/**
 * A titled side-panel section whose heading collapses its body.
 *
 * The body is hidden, not unmounted, so a half-typed dice expression or token name
 * survives a collapse; `hidden` also takes it out of the tab order and the
 * accessibility tree.
 */
export function PanelSection({ id, title, children }: Props) {
  const { isCollapsed, toggle } = useContext(SectionCollapseContext);
  const bodyId = `${useId()}-body`;
  const collapsed = isCollapsed(id);

  return (
    <section className="panel-section" data-tour={id}>
      <h2 className="panel-section-heading">
        <button
          type="button"
          className="section-toggle"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={() => toggle(id)}
        >
          <span className="chevron" aria-hidden />
          <span className="section-title">{title}</span>
        </button>
      </h2>
      <div id={bodyId} className="panel-section-body" hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
