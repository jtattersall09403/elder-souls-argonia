export interface CharacterAssetsOptions {
  /** Base URL of a sibling app on the same site that already ships the files
   * (production builds then copy nothing and resolve against it). */
  sharedBase?: string;
}
export default function characterAssets(options?: CharacterAssetsOptions): import("vite").Plugin;
