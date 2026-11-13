/**
 * Lector de códigos de barras con la cámara.
 * Usa el lector nativo del navegador si existe (Android/Chrome) y si no ZXing (iPhone).
 */
import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";

interface Props {
  onCode: (code: string) => void;
  paused?: boolean;
}

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export default function Scanner({ onCode, paused }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let zxingControls: { stop: () => void } | null = null;
    let raf = 0;
    let lastCode = "";
    let lastAt = 0;

    const emit = (code: string) => {
      const now = Date.now();
      if (pausedRef.current) return;
      if (code === lastCode && now - lastAt < 2500) return; // evitar repetir el mismo código
      lastCode = code;
      lastAt = now;
      navigator.vibrate?.(60);
      onCodeRef.current(code);
    };

    async function start() {
      const video = videoRef.current!;
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      };
      const Native = (globalThis as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
      let supported: string[] = [];
      try {
        supported = (await Native?.getSupportedFormats?.()) ?? [];
      } catch {
        supported = [];
      }
      if (Native && supported.includes("ean_13")) {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stopped) return;
        video.srcObject = stream;
        await video.play();
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
        zxingControls = await reader.decodeFromConstraints(constraints, video, (result) => {
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
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
      <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
      <div className="pointer-events-none absolute inset-x-10 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
      {error && <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-white">{t(error)}</div>}
    </div>
  );
}
