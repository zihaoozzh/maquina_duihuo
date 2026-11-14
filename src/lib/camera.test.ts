import { describe, expect, it } from "vitest";
import { sortBackCameras } from "./camera";

const cam = (label: string, deviceId = label) => ({ deviceId, label });

describe("sortBackCameras", () => {
  it("Android: camera2 0 trasera primero, sin la frontal", () => {
    const out = sortBackCameras([cam("camera2 1, facing front"), cam("camera2 2, facing back"), cam("camera2 0, facing back"), cam("camera2 3, facing back")]);
    expect(out.map((c) => c.label)).toEqual(["camera2 0, facing back", "camera2 2, facing back", "camera2 3, facing back"]);
  });
  it("teleobjetivo y gran angular al final", () => {
    const out = sortBackCameras([cam("Back Telephoto Camera"), cam("Back Ultra Wide Camera"), cam("Front Camera"), cam("Back Camera")]);
    expect(out[0].label).toBe("Back Camera");
    expect(out).toHaveLength(3);
  });
  it("sin etiquetas (aún sin permiso) no se pierde ninguna", () => {
    expect(sortBackCameras([cam("", "a"), cam("", "b")])).toHaveLength(2);
  });
});
