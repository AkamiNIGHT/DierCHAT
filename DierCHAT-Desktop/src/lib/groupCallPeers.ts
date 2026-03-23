/**
 * Правило mesh: инициатор шлёт offer всем; между остальными offer шлёт min(userId, peerId) лексикографически.
 */

export function shouldInitiateMeshPeer(selfId: string, otherId: string, initiatorId: string): boolean {
  if (selfId === otherId) return false;
  if (selfId === initiatorId) return true;
  if (otherId === initiatorId) return false;
  return selfId < otherId;
}

/** Все участники звонка (включая self), уникальные, отсортированные для payload */
export function buildParticipantIdList(selfId: string, remotePeerIds: string[]): string[] {
  const set = new Set<string>([selfId, ...remotePeerIds]);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
