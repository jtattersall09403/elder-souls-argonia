import { Canvas, advance } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_FIELD_OF_VIEW } from "@elder-souls/game-core/physics/characterPhysics";
import { CombatScene } from "./components/CombatScene";
import { input } from "@elder-souls/game-core/io/input";
import { menuForKey, uiMenuInput, type UiMenu } from "@elder-souls/game-core/io/uiMenus";
import { InventoryScreen } from "./ui/inventory/InventoryScreen";
import { RacePicker } from "./ui/RacePicker";
import { enterFullscreen, FullscreenButton } from "./components/FullscreenButton";
import { Hud } from "./components/Hud";
import { VisualFrameMarker } from "./components/VisualFrameMarker";
import { combatAudio } from "@elder-souls/game-core/fx/audio";
import { useGameStore } from "@elder-souls/game-core/core/store";
import { useInventoryStore } from "@elder-souls/game-core/inventory/store";
import { visualScenarioFromSearch } from "@elder-souls/game-core/validation/visualScenarios";
import { VISUAL_FRAME_MARKER_HEIGHT } from "@elder-souls/game-core/validation/visualFrameMarker";

/** Recorded-capture only: wall-clock dwell per 30 Hz pose, past presentation. */
const RECORDER_POSE_HOLD_MS = 90;

export function App() {
  const started = useGameStore((state) => state.started);
  const patch = useGameStore((state) => state.patch);
  const inventoryOpen = useInventoryStore((state) => state.open);
  const setInventoryOpen = useInventoryStore((state) => state.setOpen);
  const [visualScenario] = useState(() => visualScenarioFromSearch(window.location.search));
  const [visualFast] = useState(() => new URLSearchParams(window.location.search).get("fast") === "1");
  const [visualRecording] = useState(() => new URLSearchParams(window.location.search).get("recording") === "1");
  const [quality] = useState(() => visualScenario ? 1 : window.matchMedia("(pointer: coarse)").matches ? 1.35 : 1.75);
  const canvasEl = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!visualScenario) return;
    patch({
      started: true,
      enemyEnabled: visualScenario.enemy.enabled,
      enemyAiEnabled: false,
      enemyCount: 1,
      showHitboxes: new URLSearchParams(window.location.search).get("hitboxes") === "1",
      showWeaponHitboxes: new URLSearchParams(window.location.search).get("weaponhitboxes") === "1",
      message: visualScenario.label,
    });
  }, [patch, visualScenario]);

  useEffect(() => {
    if (!visualScenario) return;
    // Software WebGL can take far longer than 16 ms to draw a frame. If the
    // validation scene used that wall-clock delta, Rapier/ecctrl could advance
    // a whole jump while the combat clock advanced only its capped 1/30 s,
    // producing footage that no real gameplay clock would produce. Manual R3F
    // advancement keeps every production useFrame subscriber—including the
    // controller, physics, combat FSM, mixer, camera, and probes—on the same
    // fixed simulation clock. Rendering may be slow; the resulting motion is
    // still the exact ordered 30 fps production path.
    let request = 0;
    let recorderPacing = 0;
    let simulationTime = 0;
    let stopped = false;
    const queue = () => {
      if (!stopped) request = window.requestAnimationFrame(step);
    };
    const step = () => {
      simulationTime += 1 / 30;
      advance(simulationTime);
      if (!visualRecording) {
        queue();
        return;
      }
      // Playwright's page video samples at 25 Hz, so a pose must stay on screen
      // across a recorder sample to keep its marker code. A hold of barely one
      // 40 ms recorder period left no margin: screencast delivery jitter alone
      // could drop a single code, and the capture then aborts on an incomplete
      // marker run. Anchor the hold to actual presentation — a rAF after
      // advance() runs at the start of the compositor frame that shows the new
      // pose, so variable software-render time is outside the budget — and hold
      // for more than two recorder periods. Normalization removes this wall
      // delay. No-video smoke runs and ordinary gameplay remain unthrottled.
      window.requestAnimationFrame(() => {
        recorderPacing = window.setTimeout(queue, RECORDER_POSE_HOLD_MS);
      });
    };
    queue();
    return () => {
      stopped = true;
      window.cancelAnimationFrame(request);
      window.clearTimeout(recorderPacing);
    };
  }, [visualRecording, visualScenario]);

  /**
   * Take the pointer back for mouse-look.
   *
   * The rejection is swallowed on purpose. Chrome refuses to re-lock for a
   * second or so after the *user* pressed Escape to get out, which is a
   * deliberate anti-trap measure; the next click succeeds. Letting that reject
   * unhandled fills the console with something the player has already fixed by
   * clicking again.
   */
  const requestMouseLook = useCallback(() => {
    const element = canvasEl.current;
    if (!element || document.pointerLockElement === element) return;
    const pending = element.requestPointerLock?.() as unknown;
    if (pending && typeof (pending as Promise<void>).catch === "function") {
      (pending as Promise<void>).catch(() => undefined);
    }
  }, []);

  // The inventory is a modal screen, so it owns the keyboard while it is up and
  // releases the pointer lock the combat camera holds.
  const setMenuOpen = useCallback((menu: UiMenu, next: boolean) => {
    if (menu !== "inventory") return;
    setInventoryOpen(next);
    input.clearHeld();
    // Closing the inventory hands the camera back. The keypress that closed
    // it is the user gesture the browser wants, so this is the one moment
    // re-locking is guaranteed to be allowed.
    if (next && document.pointerLockElement) document.exitPointerLock();
    else if (!next) requestMouseLook();
  }, [requestMouseLook, setInventoryOpen]);

  useEffect(() => {
    if (visualScenario) return;
    const onKey = (event: KeyboardEvent) => {
      const menu = menuForKey(event.code);
      if (menu) {
        event.preventDefault();
        setMenuOpen(menu, !useInventoryStore.getState().open);
      } else if (event.code === "Escape" && useInventoryStore.getState().open) {
        event.preventDefault();
        setMenuOpen("inventory", false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setMenuOpen, visualScenario]);

  // Gamepad Start and the on-screen menu button are polled here rather than in
  // the combat frame loop: that loop is deliberately frozen while a modal
  // screen is up, so it could never see the press that closes the screen.
  useEffect(() => {
    if (visualScenario) return;
    let request = 0;
    const tick = () => {
      for (const menu of uiMenuInput.poll()) {
        setMenuOpen(menu, !useInventoryStore.getState().open);
      }
      request = window.requestAnimationFrame(tick);
    };
    request = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(request);
  }, [setMenuOpen, visualScenario]);

  const [looking, setLooking] = useState(false);
  useEffect(() => {
    const sync = () => setLooking(document.pointerLockElement === canvasEl.current);
    document.addEventListener("pointerlockchange", sync);
    document.addEventListener("pointerlockerror", sync);
    return () => {
      document.removeEventListener("pointerlockchange", sync);
      document.removeEventListener("pointerlockerror", sync);
    };
  }, []);

  const begin = () => {
    combatAudio.unlock();
    enterFullscreen();
    requestMouseLook();
    patch({ started: true, message: "THE HOLLOW WARDEN" });
  };

  return (
    <main
      className={`game-shell${visualScenario ? " visual-scenario" : ""}`}
      data-visual-scenario={visualScenario?.id}
      style={visualScenario ? {
        height: `calc(100% - ${VISUAL_FRAME_MARKER_HEIGHT}px)`,
        top: VISUAL_FRAME_MARKER_HEIGHT,
      } : undefined}
    >
      <Canvas
        frameloop={visualScenario ? "never" : "always"}
        shadows={!visualFast}
        dpr={[1, quality]}
        camera={{ fov: BASE_FIELD_OF_VIEW, near: 0.1, far: 70, position: [0, 3.5, 10] }}
        gl={{ antialias: !visualFast, powerPreference: "high-performance", alpha: false }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = "srgb";
          gl.shadowMap.type = 2;
          canvasEl.current = gl.domElement;
        }}
        onPointerDown={() => started && !inventoryOpen && requestMouseLook()}
      >
        <CombatScene visualScenario={visualScenario} />
      </Canvas>
      <Hud visualScenario={visualScenario} />
      {started && !looking && !inventoryOpen && !visualScenario && (
        <button className="look-hint" onClick={requestMouseLook}>
          CLICK TO LOOK
        </button>
      )}
      {!visualScenario && <InventoryScreen />}
      {visualScenario && <VisualFrameMarker />}
      {!started && (
        <section className="title-screen">
          <div className="title-rule" />
          <p>AN ECCTRL COMBAT PROTOTYPE</p>
          <h1>ASHEN RING</h1>
          <p className="subtitle">One knight. One blade. One lesson.</p>
          <RacePicker />
          <button onClick={begin}>ENTER THE ARENA</button>
          <FullscreenButton className="fullscreen-entry" />
          <small>Desktop · touch · GameSir X2s</small>
        </section>
      )}
    </main>
  );
}
