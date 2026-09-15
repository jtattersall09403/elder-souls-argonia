import { Suspense, useContext, useEffect, useState } from "react";
import * as THREE from "three";
import { BorderApron } from "@elder-souls/game-core/terrain/BorderApron";
import type { ApronManifest } from "@elder-souls/game-core/terrain/apronManifest";
import { paintFrameExtent } from "@elder-souls/game-core/terrain/apronManifest";
import { ChunkTerrain } from "./character/ChunkTerrain";
import { useApronMaterials } from "./apronMaterials";
import { SkyContext } from "./sky/WorldSky";
import type { ChunkStore, ChunksManifest } from "./character/chunkStore";

/**
 * The province's terrain with the border apron beyond it (16d).
 *
 * Ring 0 is registered on the shared chunk store and drawn by `ChunkTerrain`
 * as ordinary chunks (so the border is an ordinary chunk seam); rings 1 and 2
 * are `BorderApron`'s two coarse meshes. The apron only starts once the built
 * ground's material exists, because both apron materials borrow its albedo
 * array texture instead of allocating another 40 MB each.
 */
type TerrainProps = Omit<React.ComponentProps<typeof ChunkTerrain>, "apron" | "onGroundMaterial">;

export function ApronTerrain({ apron, ...terrain }: TerrainProps & { apron: ApronManifest | null }) {
  const [ground, setGround] = useState<THREE.MeshStandardMaterial | null>(null);
  const [materials, setMaterials] = useState<{ near: THREE.Material; far: THREE.Material } | null>(null);
  const store: ChunkStore = terrain.store;
  const manifest: ChunksManifest = terrain.manifest;
  useEffect(() => {
    if (!apron) return;
    // The apron build has written tile paths relative to `province/apron/`
    // while naming `province/apron/ring0/` as the directory; accept either, so
    // one convention in the data cannot 404 every ring-0 tile.
    const dir = apron.ring0.dir;
    const leaf = dir.replace(/\/$/, "").split("/").pop() ?? "";
    const doubled = leaf !== "" && apron.ring0.chunks.every(
      (c) => Object.values(c.lods).every((l) => l.file.startsWith(`${leaf}/`)));
    store.register(apron.ring0.chunks, doubled ? dir.replace(new RegExp(`${leaf}/$`), "") : dir);
  }, [store, apron, manifest]);
  const scale = terrain.verticalScale ?? manifest.verticalScaleAtGeometry;
  const nearFrame = apron?.paint.near;
  return (
    <>
      <ChunkTerrain
        {...terrain}
        onGroundMaterial={setGround}
        apron={apron && materials && nearFrame
          ? { chunks: apron.ring0.chunks, material: materials.near, uvOriginM: nearFrame.originM, uvExtentM: paintFrameExtent(nearFrame)[0] }
          : undefined}
      />
      {/* Its own boundary: the apron's textures must never suspend (and so
          unmount) the ground the player is standing on. */}
      {apron && ground && (
        <Suspense fallback={null}>
        <ApronMaterials apron={apron} matSet={terrain.matSet} verticalScale={scale}
          sharedArrayTexture={ground.userData.tex as THREE.DataArrayTexture} onReady={setMaterials} />
        </Suspense>
      )}
      {apron && materials && (
        <BorderApron manifest={apron} baseUrl={import.meta.env.BASE_URL} materials={materials} verticalScale={scale} />
      )}
    </>
  );
}

/** Builds the two apron materials (it suspends on their textures) and hands
 * them up, so the terrain above stays mounted while they load. */
function ApronMaterials({ apron, matSet, verticalScale, sharedArrayTexture, onReady }: {
  apron: ApronManifest;
  matSet?: string;
  verticalScale: number;
  sharedArrayTexture: THREE.DataArrayTexture;
  onReady: (m: { near: THREE.Material; far: THREE.Material } | null) => void;
}) {
  const { csm } = useContext(SkyContext);
  const materials = useApronMaterials(import.meta.env.BASE_URL, apron, matSet, verticalScale, csm, sharedArrayTexture);
  useEffect(() => {
    onReady(materials);
    return () => onReady(null);
  }, [materials, onReady]);
  return null;
}
