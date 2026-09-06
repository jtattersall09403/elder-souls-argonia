import type { WorldWaterQuery } from '@elder-souls/contracts';

/** Display-only studio exaggeration. The game keeps physical metre scale. */
export function studioScaledWaterQuery(query: WorldWaterQuery, verticalScale: number): WorldWaterQuery {
  const scale = Number.isFinite(verticalScale) && verticalScale > 0 ? verticalScale : 1;
  if (scale === 1) return query;
  return {
    sample(position, epoch) {
      const s = query.sample({ x: position.x, y: position.y / scale, z: position.z }, epoch);
      const nx = s.surfaceNormal.x, ny = s.surfaceNormal.y / scale, nz = s.surfaceNormal.z;
      const length = Math.hypot(nx, ny, nz) || 1;
      return { ...s, surfaceHeight: s.surfaceHeight * scale, depth: s.depth * scale,
        surfaceNormal: { x: nx / length, y: ny / length, z: nz / length },
        flowVelocity: { x: s.flowVelocity.x, y: s.flowVelocity.y * scale, z: s.flowVelocity.z } };
    },
    sampleSheetContact(position, radius, epoch) {
      const contact = query.sampleSheetContact?.({ ...position, y: position.y / scale }, Math.min(4, radius * Math.max(1, 1 / scale)), epoch);
      if (!contact) return null;
      const point = { ...contact.position, y: contact.position.y * scale };
      const distanceM = Math.hypot(point.x - position.x, point.y - position.y, point.z - position.z);
      if (distanceM > radius) return null;
      const length = Math.hypot(contact.normal.x, contact.normal.y / scale, contact.normal.z) || 1;
      return { ...contact, position: point, distanceM,
        normal: { x: contact.normal.x / length, y: contact.normal.y / scale / length, z: contact.normal.z / length },
        flowVelocity: { ...contact.flowVelocity, y: contact.flowVelocity.y * scale } };
    },
    emitInteraction(event) {
      const normal = event.sheetContact?.normal;
      const length = normal ? Math.hypot(normal.x, normal.y * scale, normal.z) || 1 : 1;
      query.emitInteraction({ ...event,
        position: { ...event.position, y: event.position.y / scale },
        velocity: event.velocity ? { ...event.velocity, y: event.velocity.y / scale } : undefined,
        waterVelocity: event.waterVelocity ? { ...event.waterVelocity, y: event.waterVelocity.y / scale } : undefined,
        sheetContact: event.sheetContact && normal ? { ...event.sheetContact,
          normal: { x: normal.x / length, y: normal.y * scale / length, z: normal.z / length } } : undefined });
    },
    setDisplacementSpheres(actorId, spheres) {
      // Authored volume remains SI, independent of inspection exaggeration;
      // these are hydrodynamic spheres, not the display mesh.
      return query.setDisplacementSpheres?.(actorId, spheres?.map(sphere => ({
        center: { ...sphere.center, y: sphere.center.y / scale }, radiusM: sphere.radiusM,
      })) ?? null) ?? false;
    },
  };
}
