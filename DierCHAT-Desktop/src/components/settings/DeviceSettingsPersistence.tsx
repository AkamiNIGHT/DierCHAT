/**
 * ==================== БЛОК: СИНХРОНИЗАЦИЯ НАСТРОЕК УСТРОЙСТВ ====================
 * IndexedDB + zustand: после hydration подмешиваем IDB в store; при изменениях store — пишем в IDB.
 */
import { useEffect, useRef } from 'react';
import { useStore } from '@/store';
import { loadDevicePrefsFromIDB, saveDevicePrefsToIDB } from '@/lib/deviceSettingsIDB';

function mergeIdbIntoStore() {
  void loadDevicePrefsFromIDB().then((idb) => {
    if (!idb) return;
    const cur = useStore.getState().devicePrefs;
    const merged = {
      cameraId: idb.cameraId || cur.cameraId,
      microphoneId: idb.microphoneId || cur.microphoneId,
      speakerId: idb.speakerId || cur.speakerId,
    };
    if (
      merged.cameraId !== cur.cameraId ||
      merged.microphoneId !== cur.microphoneId ||
      merged.speakerId !== cur.speakerId
    ) {
      useStore.getState().setDevicePrefs(merged);
    }
  });
}

export function DeviceSettingsPersistence() {
  const idbMerged = useRef(false);

  useEffect(() => {
    const done = () => {
      if (idbMerged.current) return;
      idbMerged.current = true;
      mergeIdbIntoStore();
    };

    if (useStore.persist.hasHydrated()) {
      done();
      return;
    }
    return useStore.persist.onFinishHydration(() => {
      done();
    });
  }, []);

  useEffect(() => {
    let prev = useStore.getState().devicePrefs;
    return useStore.subscribe((s) => {
      const n = s.devicePrefs;
      if (
        n.cameraId === prev.cameraId &&
        n.microphoneId === prev.microphoneId &&
        n.speakerId === prev.speakerId
      ) {
        return;
      }
      prev = n;
      void saveDevicePrefsToIDB(n);
    });
  }, []);

  return null;
}
