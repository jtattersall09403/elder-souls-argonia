import { RACE_IDS, RACES } from "../game/actors/races";
import { useRaceStore } from "../game/actors/raceStore";
import "./race-picker.css";

/**
 * Race selection.
 *
 * Deliberately a plain list of the generated roster rather than a hand-written
 * one: a race added to the pipeline appears here with no UI change. Choosing
 * swaps the body mounted on the shared rig, which is the whole of what a race
 * is to the game.
 */
export function RacePicker() {
  const playerRace = useRaceStore((state) => state.playerRace);
  const setPlayerRace = useRaceStore((state) => state.setPlayerRace);
  const selected = RACES[playerRace];

  return (
    <div className="race-picker" onPointerDown={(event) => event.stopPropagation()}>
      <p className="race-picker-prompt">Choose your blood</p>
      <div className="race-picker-list">
        {RACE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="race-chip"
            data-active={id === playerRace || undefined}
            onClick={() => setPlayerRace(id)}
          >
            {RACES[id].label}
          </button>
        ))}
      </div>
      <p className="race-picker-flavour">{selected?.description}</p>
    </div>
  );
}
