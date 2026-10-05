import { describe, expect, it } from "vitest";
import type { AnimatableBoolean, AnimatableNumber, AnimatableString } from "./animated-values";
import { getLookup } from "./namespace";
import {
  SceneBinding,
  entityNamespace,
  feedbackKey,
  fromTaggedValue,
  parseKeyTable,
  requestKey,
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

const entity = {
  id: "ent",
  instances: { target: { id: "target" }, sim: { id: "ent-sim" }, feedback: { id: "device-1" } },
};

describe("request and feedback keys", () => {
  it("spell numbers as positions", () => {
    expect(requestKey("joint1", "number")).toBe("joint1.target_position");
    expect(feedbackKey("joint1", "number")).toBe("joint1.position");
  });

  it("spell strings and booleans as values", () => {
    expect(requestKey("label", "string")).toBe("label.target_value");
    expect(feedbackKey("label", "string")).toBe("label.value");
    expect(requestKey("anim-lit", "boolean")).toBe("anim-lit.target_value");
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

describe("storeKeyFor", () => {
  it("reads the request under the entity for the target instance", () => {
    expect(storeKeyFor(entity, "target", "joint1", "number")).toBe("ent/joint1.target_position");
    expect(storeKeyFor(entity, "target", "anim-lit", "boolean")).toBe("ent/anim-lit.target_value");
  });

  it("reads the feedback under the device for the sim and feedback instances", () => {
    expect(storeKeyFor(entity, "ent-sim", "joint1", "number")).toBe("ent-sim/joint1.position");
    expect(storeKeyFor(entity, "device-1", "joint1", "number")).toBe("device-1/joint1.position");
    expect(storeKeyFor(entity, "device-1", "label", "string")).toBe("device-1/label.value");
  });

  it("binds nothing for an instance the entity does not have", () => {
    expect(storeKeyFor(entity, "other", "joint1", "number")).toBeUndefined();
    const targetOnly = { id: "ent", instances: { target: { id: "target" } } };
    expect(storeKeyFor(targetOnly, "ent-sim", "joint1", "number")).toBeUndefined();
  });
});

describe("SceneBinding", () => {
  const binding = new SceneBinding([{ entity, animatables: [joint, label, lit], keys }]);

  it("keeps the dot key the scene subscribes to", () => {
    expect(SceneBinding.dotKey("ent", "target", "anim-joint")).toBe("ent@target.anim-joint");
    expect(SceneBinding.dotKey("ent", "target", "anim-joint")).toBe(
      getLookup(entityNamespace("ent", "target"), "anim-joint"),
    );
  });

  it("maps every store key of every instance to its dot key", () => {
    expect(binding.dotKeysFor("ent/joint1.target_position")).toEqual(["ent@target.anim-joint"]);
    expect(binding.dotKeysFor("ent-sim/joint1.position")).toEqual(["ent@ent-sim.anim-joint"]);
    expect(binding.dotKeysFor("device-1/joint1.position")).toEqual(["ent@device-1.anim-joint"]);
    expect(binding.dotKeysFor("ent/label.target_value")).toEqual(["ent@target.anim-label"]);
    expect(binding.dotKeysFor("ent-sim/label.value")).toEqual(["ent@ent-sim.anim-label"]);
    expect(binding.dotKeysFor("device-1/anim-lit.value")).toEqual(["ent@device-1.anim-lit"]);
    expect(binding.storeKeys).toHaveLength(9);
  });

  it("takes the names from the key table, not from the animatable", () => {
    const renamed = new SceneBinding([
      { entity, animatables: [joint], keys: { "anim-joint": "anim-joint" } },
    ]);
    expect(renamed.dotKeysFor("ent/anim-joint.target_position")).toEqual(["ent@target.anim-joint"]);
    expect(renamed.dotKeysFor("ent/joint1.target_position")).toEqual([]);
    expect(renamed.requestKeyFor("ent@target.anim-joint")?.key).toBe("anim-joint.target_position");
  });

  it("binds nothing for an animatable the key table does not name", () => {
    const partial = new SceneBinding([
      { entity, animatables: [joint, lit], keys: { "anim-joint": "joint1" } },
    ]);
    expect(partial.storeKeys).toHaveLength(3);
    expect(partial.dotKeysFor("ent/anim-lit.target_value")).toEqual([]);
    expect(partial.requestKeyFor("ent@target.anim-lit")).toBeUndefined();
  });

  it("answers nothing for a key nothing reads", () => {
    expect(binding.dotKeysFor("ent/arora/time")).toEqual([]);
    expect(binding.dotKeysFor("ent/joint1.position")).toEqual([]);
    expect(SceneBinding.empty.dotKeysFor("ent/joint1.target_position")).toEqual([]);
  });

  it("resolves a write on a target dot key to the entity's request key", () => {
    expect(binding.requestKeyFor("ent@target.anim-joint")).toEqual({
      entityId: "ent",
      key: "joint1.target_position",
      animatable: joint,
    });
    expect(binding.requestKeyFor("ent@target.anim-lit")?.key).toBe("anim-lit.target_value");
  });

  it("resolves no request for a device instance's dot key", () => {
    expect(binding.requestKeyFor("ent@ent-sim.anim-joint")).toBeUndefined();
    expect(binding.requestKeyFor("ent@device-1.anim-joint")).toBeUndefined();
    expect(binding.requestKeyFor("other@target.anim-joint")).toBeUndefined();
  });

  it("round-trips every bound dot key through its store key", () => {
    for (const storeKey of binding.storeKeys) {
      for (const dotKey of binding.dotKeysFor(storeKey)) {
        const request = binding.requestKeyFor(dotKey);
        if (request) {
          expect(`${request.entityId}/${request.key}`).toBe(storeKey);
        } else {
          expect(dotKey.startsWith("ent@ent-sim.") || dotKey.startsWith("ent@device-1.")).toBe(
            true,
          );
        }
      }
    }
  });

  it("fans one device key out to every entity whose instance reads it", () => {
    const other = {
      id: "twin",
      instances: { target: { id: "target" }, feedback: { id: "device-1" } },
    };
    const shared = new SceneBinding([
      { entity, animatables: [joint], keys },
      { entity: other, animatables: [joint], keys },
    ]);
    expect(shared.dotKeysFor("device-1/joint1.position")).toEqual([
      "ent@device-1.anim-joint",
      "twin@device-1.anim-joint",
    ]);
    expect(shared.dotKeysFor("twin/joint1.target_position")).toEqual(["twin@target.anim-joint"]);
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
