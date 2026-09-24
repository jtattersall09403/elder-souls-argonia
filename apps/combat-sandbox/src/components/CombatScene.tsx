import { CombatRuntime, type CombatRuntimeSettings } from "@elder-souls/character";
import { Physics } from "@react-three/rapier";
import { useShallow } from "zustand/react/shallow";
import type { VisualScenario } from "@elder-souls/game-core/validation/visualScenarios";
import { useInventoryStore } from "@elder-souls/game-core/inventory/store";
import { flatPoolSampler } from "@elder-souls/game-core/physics/waterSampler";
import { SANDBOX_POOL } from "@elder-souls/game-core/validation/sandboxPool";
import { useGameStore, type GameSnapshot } from "../sandboxStore";
import { Arena } from "./Arena";
import { ArrowProbe, recordArrowProbeSample } from "./ArrowProbe";

/**
 * The sandbox scene: the arena, its lights, and the combat runtime from
 * `@elder-souls/character`, wired to the debug store. Composition only; the
 * encounter itself lives in the package.
 */

/** The arena pool's water, for swimming (decision 0093). One instance: the runtime resets on a new one. */
const SANDBOX_WATER = flatPoolSampler(SANDBOX_POOL);

/** The debug store's slice the runtime reads as `settings`. */
function pickRuntimeSettings(state: GameSnapshot): CombatRuntimeSettings {
  return {
    started: state.started,
    resetToken: state.resetToken,
    enemyEnabled: state.enemyEnabled,
    enemyAiEnabled: state.enemyAiEnabled,
    enemyCount: state.enemyCount,
    enemyArchetypeId: state.enemyArchetypeId,
    showWeaponHitboxes: state.showWeaponHitboxes,
    showBackstabZones: state.showBackstabZones,
    footDrivenMotion: state.footDrivenMotion,
    lockedSpeedFollowsClip: state.lockedSpeedFollowsClip,
    lockedStrideRate: state.lockedStrideRate,
    arrowGravityScale: state.arrowGravityScale,
    skillsEnabled: state.skillsEnabled,
    marksmanSkill: state.marksmanSkill,
    meleeSkill: state.meleeSkill,
    classEffectsEnabled: state.classEffectsEnabled,
    aimView: state.aimView,
    playerMaxHealth: state.playerMaxHealth,
    playerMaxStamina: state.playerMaxStamina,
    poiseEnabled: state.poiseEnabled,
    stealthStart: state.stealthStart,
    sneakSkill: state.sneakSkill,
    ambientLight: state.ambientLight,
  };
}

export function CombatScene({ visualScenario = null }: { visualScenario?: VisualScenario | null }) {
  const showHitboxes = useGameStore((state) => state.showHitboxes);
  const settings = useGameStore(useShallow(pickRuntimeSettings));
  const publish = useGameStore((state) => state.patch);
  // The inventory is a modal screen: the world stops while it is up. Pausing
  // the solver rather than only the combat update is what keeps an actor from
  // sliding to a halt, or an arrow from landing, behind the panel.
  const paused = useInventoryStore((state) => state.open) && !visualScenario;
  // The arena sky, unless an evidence shot asked for its own clear colour. The
  // fog takes it too: otherwise the far arena would still fade to the old sky
  // and the "backdrop" a gap shows through would be two different colours.
  const backdrop = visualScenario?.portrait?.backdrop ?? "#dceff4";
  return (
    <>
      <color attach="background" args={[backdrop]} />
      <fog attach="fog" args={[backdrop, 20, 46]} />
      <ambientLight intensity={0.9} color="#ffffff" />
      <hemisphereLight intensity={1.25} color="#f8fdff" groundColor="#b8c5c2" />
      <directionalLight
        castShadow
        position={[7, 12, 6]}
        intensity={2.8}
        color="#fff8e8"
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
      />
      <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} interpolate paused={paused} debug={showHitboxes}>
        <Arena />
        <CombatRuntime
          settings={settings}
          publish={publish}
          onArrowSample={recordArrowProbeSample}
          water={SANDBOX_WATER}
          visualScenario={visualScenario}
        />
        <ArrowProbe />
      </Physics>
    </>
  );
}
