import { instanceOfRawEuler, RawEuler, RawVector3 } from "./animated-values";

export function storedEulerXYZtoRPY(robotData: any): any {
  if ("rotation" in robotData.features) {
    if (!robotData.features.rotation.animated) {
      const rotationValue = robotData.features.rotation.value;
      if (!instanceOfRawEuler(rotationValue)) {
        const oldRot = rotationValue as RawVector3;
        const newRot: RawEuler = { r: oldRot.x, p: oldRot.y, y: oldRot.z };
        robotData.features.rotation.value = newRot;
      }
    } else {
      const rotationValue = robotData.features.rotation.value;
      if (!instanceOfRawEuler(rotationValue.default)) {
        const oldRot = rotationValue.default as RawVector3;
        const newRot: RawEuler = { r: oldRot.x, p: oldRot.y, y: oldRot.z };
        robotData.features.rotation.value.default = newRot;
      }
    }
  }
  if ("origin" in robotData) {
    const rotationValue = (robotData.origin as { rotation: RawEuler }).rotation;
    if (!instanceOfRawEuler(rotationValue)) {
      const oldRot = rotationValue as RawVector3;
      const newRot: RawEuler = { r: oldRot.x, p: oldRot.y, y: oldRot.z };
      (robotData.origin as { rotation: RawEuler }).rotation = newRot;
    }
  }
  return robotData;
}
