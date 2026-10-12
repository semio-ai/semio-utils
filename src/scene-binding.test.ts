import { describe, expect, it } from "vitest";
import type { AnimatableBoolean, AnimatableNumber, AnimatableString } from "./animated-values";
import { getLookup } from "./namespace";
import {
  SceneBinding,
  entityNamespace,
  feedbackKey,
  followedDeviceId,
  fromTaggedValue,
  namespaceEntity,
  parseKeyTable,
  storeKeyFor,
  toTaggedValue,
} from "./scene-binding";

const joint: AnimatableNumber = {
  id: "anim-joint",
  type: "number",
  default: 0,
  constraints: { min: -1, max: 1 },
  pub: { public: true, output: "joint1" },
};

const label: AnimatableString = {
  id: "anim-label",
  type: "string",
  default: "",
  constraints: {},
  pub: { public: true, output: "label" },
};

const lit: AnimatableBoolean = {
  id: "anim-lit",
  type: "boolean",
  default: false,
  constraints: {},
};

/** The key table the World answers for these three, by its rule. */
const keys = { "anim-joint": "joint1", "anim-label": "label", "anim-lit": "anim-lit" };

/** The World's `inputKeys` of the entity: what its writes address. */
const inputs = {
  "anim-joint": "joint1.target_position",
  "anim-label": "label.target_value",
  "anim-lit": "anim-lit.target_value",
};

/**
 * The World's `inputKeys` of the entity's two devices: the emulated one takes
 * the entity's spelling, the real one lists its targets as children and no
 * input for `anim-lit`, which it does not drive.
 */
const deviceInputs = {
  "ent-sim": inputs,
  "device-1": { "anim-joint": "joint1/target.position", "anim-label": "label/target.value" },
};

/** The joint's keys as the binding hands them to `storeKeyFor`. */
const jointKeys = {
  feedback: "joint1.position",
  inputs: { "ent-sim": "joint1.target_position", "device-1": "joint1/target.position" },
};

/** An entity with an emulated device and a real one, `device-1`, which its `feedback` instance shows. */
const entity = {
  id: "ent",
  instances: { target: { id: "target" }, sim: { id: "ent-sim" }, feedback: { id: "feedback" } },
  realDeviceId: "device-1",
};

describe("feedback keys", () => {
  it("spell a number's as its position and a string's or a boolean's as its value", () => {
    expect(feedbackKey("joint1", "number")).toBe("joint1.position");
    expect(feedbackKey("label", "string")).toBe("label.value");
    expect(feedbackKey("anim-lit", "boolean")).toBe("anim-lit.value");
  });
});

describe("parseKeyTable", () => {
  it("reads an object of names by animatable id", () => {
    expect(parseKeyTable('{"anim-joint":"joint1","anim-lit":"anim-lit"}')).toEqual({
      "anim-joint": "joint1",
      "anim-lit": "anim-lit",
    });
    expect(parseKeyTable("{}")).toEqual({});
  });

  it("reads nothing from any other shape", () => {
    expect(parseKeyTable("null")).toBeUndefined();
    expect(parseKeyTable('["joint1"]')).toBeUndefined();
    expect(parseKeyTable('{"anim-joint":1}')).toBeUndefined();
    expect(parseKeyTable('"joint1"')).toBeUndefined();
  });
});

describe("followedDeviceId", () => {
  it("is the sim instance by default and the feedback instance on request", () => {
    expect(followedDeviceId(entity)).toBe("ent-sim");
    expect(followedDeviceId(entity, "sim")).toBe("ent-sim");
    expect(followedDeviceId(entity, "feedback")).toBe("device-1");
  });

  it("is nothing when the entity has no such instance", () => {
    const targetOnly = { id: "ent", instances: { target: { id: "target" } } };
    expect(followedDeviceId(targetOnly)).toBeUndefined();
    expect(followedDeviceId(targetOnly, "feedback")).toBeUndefined();
  });

  it("is nothing for the feedback instance while no real device is bound", () => {
    const unbound = { id: "ent", instances: entity.instances };
    expect(followedDeviceId(unbound, "feedback")).toBeUndefined();
    expect(storeKeyFor(unbound, "feedback", jointKeys)).toBeUndefined();
  });

  it("is nothing for a real device no feedback instance shows", () => {
    const shown = { id: "ent", instances: { target: { id: "target" } }, realDeviceId: "device-1" };
    expect(followedDeviceId(shown, "feedback")).toBeUndefined();
    expect(storeKeyFor(shown, "target", jointKeys, "feedback")).toBeUndefined();
  });
});

describe("storeKeyFor", () => {
  it("reads the followed device's input, as that device takes it, for the target instance", () => {
    expect(storeKeyFor(entity, "target", jointKeys)).toBe("ent-sim/joint1.target_position");
    expect(storeKeyFor(entity, "target", jointKeys, "feedback")).toBe(
      "device-1/joint1/target.position",
    );
  });

  it("reads nothing for the target instance when the followed device does not drive the animatable", () => {
    const undriven = { feedback: "anim-lit.value", inputs: { "ent-sim": "anim-lit.target_value" } };
    expect(storeKeyFor(entity, "target", undriven)).toBe("ent-sim/anim-lit.target_value");
    expect(storeKeyFor(entity, "target", undriven, "feedback")).toBeUndefined();
    // Its feedback is still read: what the device does with it is the device's.
    expect(storeKeyFor(entity, "feedback", undriven)).toBe("device-1/anim-lit.value");
  });

  it("reads the feedback under the device for the sim and feedback instances", () => {
    expect(storeKeyFor(entity, "ent-sim", jointKeys)).toBe("ent-sim/joint1.position");
    expect(storeKeyFor(entity, "feedback", jointKeys)).toBe("device-1/joint1.position");
    // The real device's id is its own, not the instance's.
    expect(storeKeyFor(entity, "device-1", jointKeys)).toBeUndefined();
    // The followed device changes what `target` reads, not what a device instance reads.
    expect(storeKeyFor(entity, "ent-sim", jointKeys, "feedback")).toBe("ent-sim/joint1.position");
  });

  it("reads nothing for a target instance whose entity has no followed device", () => {
    const targetOnly = { id: "ent", instances: { target: { id: "target" } } };
    expect(storeKeyFor(targetOnly, "target", jointKeys)).toBeUndefined();
    const simOnly = { id: "ent", instances: { target: { id: "target" }, sim: { id: "ent-sim" } } };
    expect(storeKeyFor(simOnly, "target", jointKeys, "feedback")).toBeUndefined();
  });

  it("binds nothing for an instance the entity does not have", () => {
    expect(storeKeyFor(entity, "other", jointKeys)).toBeUndefined();
    const targetOnly = { id: "ent", instances: { target: { id: "target" } } };
    expect(storeKeyFor(targetOnly, "ent-sim", jointKeys)).toBeUndefined();
  });
});

describe("SceneBinding", () => {
  const binding = new SceneBinding([
    { entity, animatables: [joint, label, lit], keys, inputs, deviceInputs },
  ]);

  it("keeps the dot key the scene subscribes to", () => {
    expect(SceneBinding.dotKey("ent", "target", "anim-joint")).toBe("ent@target.anim-joint");
    expect(SceneBinding.dotKey("ent", "target", "anim-joint")).toBe(
      getLookup(entityNamespace("ent", "target"), "anim-joint"),
    );
  });

  it("maps every store key of every instance to its dot key", () => {
    expect(binding.dotKeysFor("ent-sim/joint1.target_position")).toEqual(["ent@target.anim-joint"]);
    expect(binding.dotKeysFor("ent-sim/joint1.position")).toEqual(["ent@ent-sim.anim-joint"]);
    expect(binding.dotKeysFor("device-1/joint1.position")).toEqual(["ent@feedback.anim-joint"]);
    expect(binding.dotKeysFor("ent-sim/label.target_value")).toEqual(["ent@target.anim-label"]);
    expect(binding.dotKeysFor("ent-sim/label.value")).toEqual(["ent@ent-sim.anim-label"]);
    expect(binding.dotKeysFor("device-1/anim-lit.value")).toEqual(["ent@feedback.anim-lit"]);
    expect(binding.storeKeys).toHaveLength(9);
  });

  it("reads the robot's inputs for the target instance when the view follows the feedback device", () => {
    const robotView = new SceneBinding([
      { entity, animatables: [joint, lit], keys, inputs, deviceInputs, follows: "feedback" },
    ]);
    expect(robotView.dotKeysFor("device-1/joint1/target.position")).toEqual([
      "ent@target.anim-joint",
    ]);
    expect(robotView.dotKeysFor("device-1/joint1.target_position")).toEqual([]);
    expect(robotView.dotKeysFor("ent-sim/joint1.target_position")).toEqual([]);
    expect(robotView.dotKeysFor("ent-sim/joint1.position")).toEqual(["ent@ent-sim.anim-joint"]);
    expect(robotView.dotKeysFor("device-1/joint1.position")).toEqual(["ent@feedback.anim-joint"]);
    // A write is still the entity's; only what undoes a refused one moves.
    expect(robotView.targetFor("ent@target.anim-joint")).toEqual({
      entityId: "ent",
      key: "joint1.target_position",
      animatable: joint,
      storeKey: "device-1/joint1/target.position",
    });
    // The robot does not drive the lamp: the target reads nothing, a write still reaches the entity.
    expect(robotView.targetFor("ent@target.anim-lit")).toEqual({
      entityId: "ent",
      key: "anim-lit.target_value",
      animatable: lit,
      storeKey: undefined,
    });
  });

  it("reads a device's inputs anew when the World resolves them again", () => {
    const unpaired = new SceneBinding([
      {
        entity,
        animatables: [joint],
        keys,
        inputs,
        deviceInputs: { "ent-sim": inputs },
        follows: "feedback",
      },
    ]);
    expect(unpaired.targetFor("ent@target.anim-joint")?.storeKey).toBeUndefined();
    const paired = new SceneBinding([
      { entity, animatables: [joint], keys, inputs, deviceInputs, follows: "feedback" },
    ]);
    expect(paired.targetFor("ent@target.anim-joint")?.storeKey).toBe(
      "device-1/joint1/target.position",
    );
  });

  it("feeds a target instance with no followed device by direct writes only", () => {
    const unbound = { id: "ent", instances: { target: { id: "target" } } };
    const direct = new SceneBinding([
      { entity: unbound, animatables: [joint], keys, inputs, deviceInputs: {} },
    ]);
    expect(direct.storeKeys).toEqual([]);
    const target = direct.targetFor("ent@target.anim-joint");
    expect(target).toEqual({ entityId: "ent", key: "joint1.target_position", animatable: joint });
    expect(target).toHaveProperty("storeKey", undefined);
  });

  it("takes the names from the World's tables, not from the animatable", () => {
    const renamedInputs = { "anim-joint": "anim-joint.target_position" };
    const renamed = new SceneBinding([
      {
        entity,
        animatables: [joint],
        keys: { "anim-joint": "anim-joint" },
        inputs: renamedInputs,
        deviceInputs: { "ent-sim": renamedInputs },
      },
    ]);
    expect(renamed.dotKeysFor("ent-sim/anim-joint.target_position")).toEqual([
      "ent@target.anim-joint",
    ]);
    expect(renamed.dotKeysFor("ent-sim/anim-joint.position")).toEqual(["ent@ent-sim.anim-joint"]);
    expect(renamed.dotKeysFor("ent-sim/joint1.target_position")).toEqual([]);
    expect(renamed.targetFor("ent@target.anim-joint")?.key).toBe("anim-joint.target_position");
  });

  it("binds nothing for an animatable the key table does not name", () => {
    const partial = new SceneBinding([
      { entity, animatables: [joint, lit], keys: { "anim-joint": "joint1" }, inputs, deviceInputs },
    ]);
    expect(partial.storeKeys).toHaveLength(3);
    expect(partial.dotKeysFor("ent-sim/anim-lit.target_value")).toEqual([]);
    expect(partial.targetFor("ent@target.anim-lit")).toBeUndefined();
  });

  it("answers nothing for a key nothing reads", () => {
    expect(binding.dotKeysFor("ent-sim/arora/time")).toEqual([]);
    expect(binding.dotKeysFor("ent/joint1.target_position")).toEqual([]);
    expect(binding.dotKeysFor("device-1/joint1.target_position")).toEqual([]);
    expect(SceneBinding.empty.dotKeysFor("ent-sim/joint1.target_position")).toEqual([]);
  });

  it("resolves a write on a target dot key to the entity and its input key", () => {
    expect(binding.targetFor("ent@target.anim-joint")).toEqual({
      entityId: "ent",
      key: "joint1.target_position",
      animatable: joint,
      storeKey: "ent-sim/joint1.target_position",
    });
    expect(binding.targetFor("ent@target.anim-lit")?.key).toBe("anim-lit.target_value");
  });

  it("resolves no target for a device instance's dot key", () => {
    expect(binding.targetFor("ent@ent-sim.anim-joint")).toBeUndefined();
    expect(binding.targetFor("ent@feedback.anim-joint")).toBeUndefined();
    expect(binding.targetFor("other@target.anim-joint")).toBeUndefined();
  });

  it("round-trips every target dot key through the followed device's input key", () => {
    for (const storeKey of binding.storeKeys) {
      for (const dotKey of binding.dotKeysFor(storeKey)) {
        const target = binding.targetFor(dotKey);
        if (target) {
          expect(target.storeKey).toBe(storeKey);
          expect(storeKey).toBe(`ent-sim/${target.key}`);
        } else {
          expect(dotKey.startsWith("ent@ent-sim.") || dotKey.startsWith("ent@feedback.")).toBe(
            true,
          );
        }
      }
    }
  });

  it("fans one device key out to every entity whose instance reads it", () => {
    const other = {
      id: "twin",
      instances: { target: { id: "target" }, feedback: { id: "feedback" } },
      realDeviceId: "device-1",
    };
    const shared = new SceneBinding([
      { entity, animatables: [joint], keys, inputs, deviceInputs },
      { entity: other, animatables: [joint], keys, inputs, deviceInputs, follows: "feedback" },
    ]);
    expect(shared.dotKeysFor("device-1/joint1.position")).toEqual([
      "ent@feedback.anim-joint",
      "twin@feedback.anim-joint",
    ]);
    expect(shared.dotKeysFor("device-1/joint1/target.position")).toEqual([
      "twin@target.anim-joint",
    ]);
    expect(shared.dotKeysFor("ent-sim/joint1.target_position")).toEqual(["ent@target.anim-joint"]);
  });
});

describe("tagged values", () => {
  it("tags a scalar by its arora variant", () => {
    expect(toTaggedValue(0.5)).toEqual({ f64: 0.5 });
    expect(toTaggedValue("x")).toEqual({ str: "x" });
    expect(toTaggedValue(true)).toEqual({ bool: true });
  });

  it("reads the scalar back", () => {
    expect(fromTaggedValue({ f64: 0.5 })).toBe(0.5);
    expect(fromTaggedValue({ str: "x" })).toBe("x");
    expect(fromTaggedValue({ bool: false })).toBe(false);
  });

  it("reads every numeric width as a number", () => {
    expect(fromTaggedValue({ f32: 1.5 })).toBe(1.5);
    expect(fromTaggedValue({ u64: 3 })).toBe(3);
    expect(fromTaggedValue({ i32: -2 })).toBe(-2);
  });

  it("reads nothing from a shape an animatable cannot hold", () => {
    expect(fromTaggedValue({ unit: null })).toBeUndefined();
    expect(fromTaggedValue({ f64s: [1, 2] })).toBeUndefined();
    expect(fromTaggedValue({ struct: { a: { f64: 1 } } })).toBeUndefined();
    expect(fromTaggedValue({ bool: "true" })).toBeUndefined();
    expect(fromTaggedValue({ f64: 1, str: "x" })).toBeUndefined();
    expect(fromTaggedValue(0.5)).toBeUndefined();
    expect(fromTaggedValue(null)).toBeUndefined();
    expect(fromTaggedValue(undefined)).toBeUndefined();
  });

  it("round-trips through JSON", () => {
    for (const value of [0.25, "label", true] as const) {
      expect(fromTaggedValue(JSON.parse(JSON.stringify(toTaggedValue(value))))).toBe(value);
    }
  });
});

describe("namespaceEntity", () => {
  it("is the entity of the namespace entityNamespace spells, and a bare id's own", () => {
    expect(namespaceEntity(entityNamespace("ent-1", "inst-2"))).toBe("ent-1");
    expect(namespaceEntity("default")).toBe("default");
  });
});
