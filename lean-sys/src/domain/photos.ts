import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { PhotoAngle } from '../types';

/**
 * Progress photos are half-naked mirror shots. They NEVER leave the device.
 * We copy the picked/captured image into the app's private documents dir and
 * store only the local file URI. No upload path exists anywhere in this app.
 */

const PHOTO_DIR = FileSystem.documentDirectory + 'progress/';

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PHOTO_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
}

export const ANGLES: PhotoAngle[] = ['front', 'side', 'relaxed'];

export const ANGLE_LABEL: Record<PhotoAngle, string> = {
  front: 'FRONT',
  side: 'SIDE',
  relaxed: 'RELAXED-FRONT',
};

/** Launch camera; returns a persisted local URI or null if cancelled. */
export async function capturePhoto(date: string, angle: PhotoAngle): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return pickFromLibrary(date, angle);
  const res = await ImagePicker.launchCameraAsync({ quality: 0.85, cameraType: ImagePicker.CameraType.front });
  if (res.canceled || !res.assets[0]) return null;
  return persist(res.assets[0].uri, date, angle);
}

/** Fallback / alternative: pick from library. */
export async function pickFromLibrary(date: string, angle: PhotoAngle): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.85, mediaTypes: ImagePicker.MediaTypeOptions.Images });
  if (res.canceled || !res.assets[0]) return null;
  return persist(res.assets[0].uri, date, angle);
}

async function persist(srcUri: string, date: string, angle: PhotoAngle): Promise<string> {
  await ensureDir();
  const ext = srcUri.split('.').pop()?.split('?')[0] || 'jpg';
  const dest = `${PHOTO_DIR}${date}_${angle}_${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: srcUri, to: dest });
  return dest;
}

export async function deleteFile(uri: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // best-effort; row deletion is the source of truth
  }
}
