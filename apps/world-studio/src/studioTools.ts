// The world studio is the owner's own tool, not a demo: deployed and local
// builds must behave identically. Never gate studio tooling on
// `import.meta.env.DEV`/`PROD` (owner ruling 2026-09-22). Dev-only gating
// belongs in the game app, not here.
export const STUDIO_TOOLS = true as const;
