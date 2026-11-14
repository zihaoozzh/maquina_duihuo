/**
 * Elección de la cámara trasera. En móviles con varias lentes (principal, gran angular,
 * teleobjetivo, macro) Chrome a veces abre una que no es la principal: sale con zoom o
 * borrosa. Aquí se elige la principal y se recuerda la que prefiera cada móvil.
 */

const NOT_MAIN = /(tele|zoom|ultra|wide|macro|depth|tof|infrared|长焦|广角|微距)/i;
const BACK = /(back|rear|environment|trasera|后置|後置)/i;
const FRONT = /(front|user|frontal|facetime|前置)/i;

export interface CameraInfo {
  deviceId: string;
  label: string;
}

/** Cámaras traseras con la principal primero. Sin etiquetas (sin permiso aún) se dejan todas. */
export function sortBackCameras(devices: CameraInfo[]): CameraInfo[] {
  const back = devices.filter((d) => !FRONT.test(d.label));
  const list = back.length ? back : devices;
  const score = (d: CameraInfo) => {
    let s = 0;
    if (BACK.test(d.label)) s += 2;
    if (NOT_MAIN.test(d.label)) s -= 5;
    // Android: "camera2 0, facing back" es casi siempre la principal
    const m = /camera2?\s*(\d+)/i.exec(d.label);
    if (m) s -= Number(m[1]) * 0.1;
    return s;
  };
  return [...list].sort((a, b) => score(b) - score(a));
}

const KEY = "camera-device";
export function savedCamera(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function saveCamera(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* sin almacenamiento */
  }
}

export async function listBackCameras(): Promise<CameraInfo[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return sortBackCameras(all.filter((d) => d.kind === "videoinput").map((d) => ({ deviceId: d.deviceId, label: d.label })));
}

const RES = { width: { ideal: 1920 }, height: { ideal: 1080 } };

/** Abre la cámara pedida (o la trasera por defecto si falla). */
export async function openCamera(deviceId: string | null): Promise<MediaStream> {
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: deviceId }, ...RES } });
    } catch {
      /* esa lente ya no existe: usar la trasera por defecto */
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, ...RES } });
}

type ExtCaps = MediaTrackCapabilities & { zoom?: { min: number; max: number }; focusMode?: string[] };

const apply = (track: MediaStreamTrack, c: Record<string, unknown>) =>
  track.applyConstraints({ advanced: [c as MediaTrackConstraintSet] }).catch(() => {});

/** Sin zoom y con enfoque automático continuo, si la cámara lo permite. */
export async function tuneTrack(track: MediaStreamTrack) {
  const caps = (track.getCapabilities?.() ?? {}) as ExtCaps;
  if (caps.zoom && typeof caps.zoom.min === "number") await apply(track, { zoom: caps.zoom.min });
  if (caps.focusMode?.includes("continuous")) await apply(track, { focusMode: "continuous" });
}

/** Tocar el visor: volver a enfocar. */
export async function refocus(track: MediaStreamTrack) {
  const modes = ((track.getCapabilities?.() ?? {}) as ExtCaps).focusMode ?? [];
  if (modes.includes("single-shot")) await apply(track, { focusMode: "single-shot" });
  if (modes.includes("continuous")) await apply(track, { focusMode: "continuous" });
}
