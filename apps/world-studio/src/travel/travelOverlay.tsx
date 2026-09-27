import { CATALOGUE, text } from "@elder-souls/text-catalogue";
import type { ServiceMenu } from "@elder-souls/game-core/travel/travelServices";
import { input } from "@elder-souls/game-core/io/input";

export const TALK_TEXT_ID = "text.travel.prompt-talk";

/** Catalogue lookup that survives a record naming a string nobody wrote:
 * this is a debug seam, so a missing id shows as the id. */
function safeText(id: string): string {
  try {
    return text(CATALOGUE, id);
  } catch {
    return id;
  }
}

/** `{name}` substitution. The catalogue stores the string; the caller fills it. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}

/**
 * The travel sockets' screen UI: the load error, the talk prompt (also the
 * touch button), the arrival notice and the service menu. Plain DOM drawn
 * over the canvas through the screen-overlay channel (screenOverlay.tsx);
 * `TravelSockets` in the canvas owns the state and passes it here.
 */
export function TravelOverlay({ loadError, prompt, notice, menu, purse = 0, onTravel, onClose }: {
  loadError: string | null;
  /** The focused socket's operator, when its talk prompt shows. */
  prompt: { role: string } | null;
  notice: string | null;
  menu: ServiceMenu | null;
  purse?: number;
  onTravel: (toStationId: string) => void;
  onClose: () => void;
}) {
  const service = menu?.service;
  return (
    <>
      {loadError && (
        <div style={{ position: "absolute", top: 120, left: 12, color: "#ff9a9a", font: "12px system-ui" }}>
          travel sockets: {loadError}
        </div>
      )}
      {prompt && !menu && (
        <div data-travel-prompt data-ui-capture
          // The prompt is the touch button: pressing it is `activate`.
          onPointerDown={(e) => { e.preventDefault(); input.setVirtual("activate", true); }}
          onPointerUp={() => input.setVirtual("activate", false)}
          onPointerCancel={() => input.setVirtual("activate", false)}
          onPointerLeave={() => input.setVirtual("activate", false)}
          style={{
            position: "absolute", bottom: "26%", left: "50%", transform: "translateX(-50%)",
            background: "rgba(10,14,20,0.8)", padding: "8px 18px", borderRadius: 8,
            font: "18px system-ui", color: "#ffd9a0", whiteSpace: "nowrap",
            pointerEvents: "auto", touchAction: "none", cursor: "pointer",
          }}>
          {fill(text(CATALOGUE, TALK_TEXT_ID), { role: prompt.role })} <span style={{ opacity: 0.7 }}>[E]</span>
        </div>
      )}
      {notice && !menu && (
        <div role="status" data-travel-notice style={{
          position: "absolute", top: "34%", left: "50%", transform: "translate(-50%, -50%)",
          background: "rgba(10,14,20,0.8)", padding: "12px 22px", borderRadius: 10,
          font: "20px system-ui", color: "#ffd9a0", whiteSpace: "nowrap",
        }}>
          {notice}
        </div>
      )}
      {menu && service && (
        <div data-travel-menu style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: 380, maxHeight: "70vh", overflowY: "auto", pointerEvents: "auto",
          background: "rgba(10,14,20,0.92)", border: "1px solid #3a4550", borderRadius: 10,
          padding: "14px 16px", font: "14px system-ui", color: "#e6ecf5",
        }}>
          <div style={{ font: "600 16px system-ui", marginBottom: 6 }}>{safeText(service.text.name)}</div>
          <div style={{ opacity: 0.9, marginBottom: 8 }}>
            {safeText(menu.refusal ? menu.refusal.textId : service.text.hail)}
          </div>
          <div style={{ marginBottom: 10, opacity: 0.85 }}>
            {menu.refusal
              ? null
              : menu.unavailable
                ? text(CATALOGUE, "text.travel.unavailable")
                : menu.fareGold === 0
                  ? text(CATALOGUE, "text.travel.menu-free")
                  : fill(text(CATALOGUE, "text.travel.menu-fare"), { gold: String(menu.fareGold) })}
            <span style={{ float: "right", opacity: 0.7 }}>purse {purse}</span>
          </div>
          {menu.destinations.map((d) => (
            <button key={d.stationId} onClick={() => onTravel(d.stationId)} style={{
              display: "block", width: "100%", textAlign: "left", marginBottom: 6,
              padding: "6px 8px", cursor: "pointer",
            }}>
              {d.stationId} · {Math.round(d.lengthM)} m
            </button>
          ))}
          <button onClick={onClose} style={{ marginTop: 6, padding: "4px 10px", cursor: "pointer" }}>
            Esc
          </button>
        </div>
      )}
    </>
  );
}
