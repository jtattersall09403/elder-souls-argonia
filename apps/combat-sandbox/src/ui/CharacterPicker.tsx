import { useRef } from "react";
import { CATALOGUE, text } from "@elder-souls/text-catalogue";
import {
  AVAILABLE_SEXES,
  RACES,
  RACE_IDS,
  resolveBuild,
  type Sex,
} from "@elder-souls/game-core/actors/races";
import { useRaceStore } from "@elder-souls/game-core/actors/raceStore";
import { gridStep, isGridKey } from "./characterPickerGrid";
import "./character-picker.css";

/**
 * Who you are, on the title screen: a sex toggle and a race grid.
 *
 * Two axes, not twenty options (decision 0054). The grid is a fixed five
 * columns so the panel keeps one shape whatever the labels say, and it is
 * driven by real roving-focus keyboard navigation rather than mouse only —
 * this is the selection a controller will drive.
 *
 * Both lists come from the generated roster, so a race added to the pipeline
 * appears here with no UI change.
 */

const COLUMNS = 5;

const SEX_LABEL: Record<Sex, string> = {
  male: text(CATALOGUE, "text.sandbox.sex-male"),
  female: text(CATALOGUE, "text.sandbox.sex-female"),
};

export function CharacterPicker() {
  const playerRace = useRaceStore((state) => state.playerRace);
  const playerSex = useRaceStore((state) => state.playerSex);
  const setPlayerRace = useRaceStore((state) => state.setPlayerRace);
  const setPlayerSex = useRaceStore((state) => state.setPlayerSex);

  const grid = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(0, RACE_IDS.indexOf(playerRace));
  const selectedRace = RACES[playerRace];
  // What is actually on screen: the roster may not carry every pair yet.
  const build = resolveBuild(playerRace, playerSex);

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isGridKey(event.key)) return;
    event.preventDefault();
    const next = gridStep(selectedIndex, event.key, RACE_IDS.length, COLUMNS);
    setPlayerRace(RACE_IDS[next]);
    // Roving focus: the grid is one tab stop, and the selected cell owns it.
    grid.current?.querySelector<HTMLButtonElement>(`[data-index="${next}"]`)?.focus();
  };

  return (
    <div className="character-picker" onPointerDown={(event) => event.stopPropagation()}>
      <p className="character-picker-prompt">{text(CATALOGUE, "text.sandbox.character-prompt")}</p>

      <div
        className="character-picker-sex"
        role="radiogroup"
        aria-label={text(CATALOGUE, "text.sandbox.character-sex")}
      >
        {AVAILABLE_SEXES.map((sex) => (
          <button
            key={sex}
            type="button"
            role="radio"
            aria-checked={sex === playerSex}
            className="character-picker-segment"
            data-active={sex === playerSex || undefined}
            onClick={() => setPlayerSex(sex)}
          >
            {SEX_LABEL[sex]}
          </button>
        ))}
      </div>

      <div
        ref={grid}
        className="character-picker-grid"
        role="radiogroup"
        aria-label={text(CATALOGUE, "text.sandbox.character-race")}
        onKeyDown={onGridKeyDown}
      >
        {RACE_IDS.map((id, index) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={id === playerRace}
            data-index={index}
            tabIndex={index === selectedIndex ? 0 : -1}
            className="character-picker-cell"
            data-active={id === playerRace || undefined}
            onClick={() => setPlayerRace(id)}
          >
            {RACES[id].label}
          </button>
        ))}
      </div>

      <p className="character-picker-identity">
        {selectedRace?.label} · {SEX_LABEL[build.sex]}
      </p>
      <p className="character-picker-flavour">{selectedRace?.description}</p>
    </div>
  );
}
