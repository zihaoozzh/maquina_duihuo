import { describe, expect, it } from "vitest";
import { createDedupe } from "./scanDedupe";
import { barcodeKey, isGtinChecksumValid } from "./ean";
import { sortBackCameras } from "./camera";

describe("createDedupe", () => {
  it("no repite el mismo código dentro de la ventana", () => {
    const d = createDedupe(2500);
    expect(d.accept("8410000000000", 0)).toBe(true);
    expect(d.accept("8410000000000", 1000)).toBe(false);
    expect(d.accept("8410000000000", 2499)).toBe(false);
  });
  it("lo vuelve a aceptar pasada la ventana", () => {
    const d = createDedupe(2500);
    d.accept("A", 0);
    expect(d.accept("A", 2500)).toBe(true);
  });
  it("un código distinto se acepta siempre", () => {
    const d = createDedupe(2500);
    d.accept("A", 0);
    expect(d.accept("B", 10)).toBe(true);
    expect(d.accept("A", 20)).toBe(true);
  });
});

describe("barcodeKey", () => {
  it("UPC-A, EAN-13 con 0 y GTIN-14 comparten clave", () => {
    expect(barcodeKey("036000291452")).toBe(barcodeKey("0036000291452"));
    expect(barcodeKey("0036000291452")).toBe(barcodeKey("00036000291452"));
  });
  it("fuzz: añadir ceros a la izquierda no cambia la clave", () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 10000; i++) {
      const body = Array.from({ length: 12 }, () => Math.floor(rnd() * 10)).join("");
      expect(barcodeKey(`0${body}`)).toBe(barcodeKey(`00${body}`));
    }
  });
  it("el dígito de control detecta un dígito cambiado", () => {
    expect(isGtinChecksumValid("4006381333931")).toBe(true);
    expect(isGtinChecksumValid("4006381333932")).toBe(false);
  });
});

describe("sortBackCameras con etiquetas reales", () => {
  const cam = (label: string) => ({ deviceId: label, label });
  it("Pixel/Samsung: la principal primero", () => {
    const out = sortBackCameras([cam("camera2 3, facing back"), cam("camera2 1, facing front"), cam("camera2 0, facing back")]);
    expect(out[0].label).toBe("camera2 0, facing back");
  });
  it("iPhone: la trasera normal antes que ultra gran angular y teleobjetivo", () => {
    const out = sortBackCameras([cam("Back Ultra Wide Camera"), cam("Back Telephoto Camera"), cam("Back Camera"), cam("Front Camera")]);
    expect(out[0].label).toBe("Back Camera");
  });
  it("etiquetas en chino: descarta gran angular y largo foco", () => {
    const out = sortBackCameras([cam("后置广角摄像头"), cam("后置长焦摄像头"), cam("后置摄像头"), cam("前置摄像头")]);
    expect(out[0].label).toBe("后置摄像头");
  });
});
