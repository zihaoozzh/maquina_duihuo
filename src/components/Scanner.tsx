/**
 * Lector de códigos de barras con la cámara.
 * Usa el lector nativo del navegador si existe (Android/Chrome) y si no ZXing (iPhone).
 * Abre la lente trasera principal (no el teleobjetivo ni el gran angular); si hay varias,
 * el botón 切换镜头 cambia de una a otra y el móvil recuerda la elegida.
 */
import { useEffect, useRef, useState } from "react";
import { listBackCameras, openCamera, refocus, saveCamera, savedCamera, tuneTrack, type CameraInfo } from "../lib/camera";
import { t } from "../lib/i18n";
import { createDedupe } from "../lib/scanDedupe";

interface Props {
  onCode: (code: string) => void;
  paused?: boolean;
}

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export default function Scanner({ onCode, paused }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState("");
  const [deviceId, setDeviceId] = useState<string | null>(() => savedCamera());
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let zxingControls: { stop: () => void } | null = null;
    let raf = 0;
    const dedupe = createDedupe(2500);

    const emit = (code: string) => {
      if (pausedRef.current) return;
      if (!dedupe.accept(code, Date.now())) return; // evitar repetir el mismo código
      navigator.vibrate?.(60);
      onCodeRef.current(code);
    };

    async function start() {
      const video = videoRef.current!;
      setError("");
      stream = await openCamera(deviceId);
      if (stopped) return;

      // Con el permiso ya dado, las cámaras tienen nombre: si Chrome abrió otra lente, cambiar a la principal
      const list = await listBackCameras().catch(() => [] as CameraInfo[]);
      if (stopped) return;
      setCameras(list);
      const openedId = stream.getVideoTracks()[0]?.getSettings().deviceId;
      if (!deviceId && list.length > 1 && list[0].deviceId && openedId !== list[0].deviceId) {
        stream.getTracks().forEach((tr) => tr.stop());
        stream = await openCamera(list[0].deviceId);
        if (stopped) return;
      }
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      await tuneTrack(track);
      if (stopped) return;
      video.srcObject = stream;
      await video.play().catch(() => {});

      const Native = (globalThis as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
      let supported: string[] = [];
      try {
        supported = (await Native?.getSupportedFormats?.()) ?? [];
      } catch {
        supported = [];
      }
      if (Native && supported.includes("ean_13")) {
        const detector = new Native({ formats: FORMATS.filter((f) => supported.includes(f)) });
        let busy = false;
        const loop = async () => {
          if (stopped) return;
          if (!busy && video.readyState >= 2) {
            busy = true;
            try {
              const found = await detector.detect(video);
              if (found[0]?.rawValue) emit(found[0].rawValue);
            } catch {
              /* frame no válido */
            }
            busy = false;
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } else {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
        ]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 });
        if (stopped) return;
        zxingControls = await reader.decodeFromStream(stream, video, (result) => {
          if (result) emit(result.getText());
        });
        if (stopped) zxingControls.stop();
      }
    }

    start().catch(() => !stopped && setError("No se pudo abrir la cámara. Revisa los permisos del navegador."));

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      zxingControls?.stop();
      stream?.getTracks().forEach((tr) => tr.stop());
      trackRef.current = null;
    };
  }, [deviceId]);

  function nextCamera() {
    if (cameras.length < 2) return;
    const current = trackRef.current?.getSettings().deviceId ?? deviceId;
    const i = cameras.findIndex((c) => c.deviceId === current);
    const next = cameras[(i + 1) % cameras.length].deviceId;
    saveCamera(next);
    setDeviceId(next);
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline onClick={() => trackRef.current && refocus(trackRef.current)} />
      <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
      <div className="pointer-events-none absolute inset-x-10 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
      <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-white/80">{t("Toca la imagen para enfocar")}</p>
      {cameras.length > 1 && (
        <button type="button" className="absolute right-2 top-2 rounded-lg bg-black/60 px-3 py-1.5 text-sm font-semibold text-white" onClick={nextCamera}>
          ⟳ {t("Cambiar lente")}
        </button>
      )}
      {error && <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-white">{t(error)}</div>}
    </div>
  );
}
