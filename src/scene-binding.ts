import type { AnimatableValue } from "./animated-values";
import { getLookup } from "./namespace";

/**
 * The one value shape an animatable takes at runtime: the scalar of its `type`.
 * Composite animatables (vectors, eulers, colors) are flattened to one scalar
 * per axis before they reach a store, so nothing here handles an object.
 */
export type ScalarValue = number | string | boolean;

/**
 * An arora `Value` as it crosses the JS boundary: the externally tagged JSON of
 * the Rust enum, tagged by its serde name. Only the three shapes a Studio
 * animatable produces are spelled out; `fromTaggedValue` also reads the other
 * numeric tags, since a device may publish a feedback number as any width.
 */
export type TaggedValue = { f64: number } | { str: string } | { bool: boolean };

/** The serde tags of arora's numeric `Value` variants, all read as a number. */
const NUMERIC_TAGS = new Set(["f64", "f32", "i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64"]);

/** The tagged `Value` JSON for a scalar: `number` is an `f64`, never an integer. */
export function toTaggedValue(value: ScalarValue): TaggedValue {
  switch (typeof value) {
    case "number":
      return { f64: value };
    case "string":
      return { str: value };
    case "boolean":
      return { bool: value };
  }
}

/**
 * The scalar inside a tagged `Value`, or `undefined` when the value is not one
 * an animatable can hold (a structure, an array, `unit`, or not a tagged value at
 * all). A caller that reads a key it bound to an animatable treats `undefined`
 * as "nothing to project", not as an error: the key is the device's to type.
 */
export function fromTaggedValue(tagged: unknown): ScalarValue | undefined {
  if (typeof tagged !== "object" || tagged === null) return undefined;
  const entries = Object.entries(tagged);
  if (entries.length !== 1) return undefined;
  const [tag, inner] = entries[0];
  if (NUMERIC_TAGS.has(tag) && typeof inner === "number") return inner;
  if (tag === "str" && typeof inner === "string") return inner;
  if (tag === "bool" && typeof inner === "boolean") return inner;
  return undefined;
}

/**
 * The name an animatable's keys carry under every device bound to its entity,
 * by animatable id, as the World returns it from `spawnEntity`. The World is
 * the authority on the rule (an animatable's `pub.output` when it is non-empty
 * and unique within the entity, else its id); nothing on this side recomputes
 * it, so an input and the feedback it produces line up key for key whatever
 * the rule does for an entity.
 */
export type KeyTable = Readonly<Record<string, string>>;

/**
 * The key table a `spawnEntity` result holds, or `undefined` when the result
 * is not an object of strings keyed by animatable id.
 */
export function parseKeyTable(json: string): KeyTable | undefined {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const entries = Object.entries(parsed);
  if (!entries.every(([, key]) => typeof key === "string")) return undefined;
  return Object.fromEntries(entries) as KeyTable;
}

/**
 * The key, relative to a device's namespace, that holds the input the device
 * received for an animatable named `key`: `<key>.target_position` for a
 * number, `<key>.target_value` for a string or a boolean. Numbers keep
 * `position` because arora's HALs, the ROS 2 HAL and Studio's own device
 * commands all spell it that way. It is the key a direct write lands on and
 * the key a playing animation drives.
 */
export function inputKey(key: string, type: AnimatableValue["type"]): string {
  return `${key}.${type === "number" ? "target_position" : "target_value"}`;
}

/**
 * The key, relative to a device's namespace, that holds what the device did
 * with an animatable named `key`: `<key>.position` for a number, `<key>.value`
 * otherwise. It pairs with {@link inputKey} suffix for suffix, so "what reached
 * the device" and "what it did" are the same key under one namespace; an
 * emulated device's HAL mirrors one onto the other for every type.
 */
export function feedbackKey(key: string, type: AnimatableValue["type"]): string {
  return `${key}.${type === "number" ? "position" : "value"}`;
}

/**
 * The namespace a scene instance of an entity reads under: `entityId@instanceId`.
 * Every per-instance dot key in the values store starts with it.
 */
export function entityNamespace(entityId: string, instanceId: string): string {
  return `${entityId}@${instanceId}`;
}

/** An entity's instances, by the field that names each one's role. */
export interface BoundInstances {
  /** The instance that shows the inputs of the device the view follows. */
  target: { id: string };
  /** An emulated device bound to the entity; its id is the device's namespace. */
  sim?: { id: string };
  /** A real device bound to the entity; its id is the device's namespace. */
  feedback?: { id: string };
}

/** The part of a project entity the binding reads: its id and its instances. */
export interface BoundEntity {
  id: string;
  instances: BoundInstances;
}

/**
 * Which of an entity's bound devices the main view follows: the instance whose
 * device the `target` instance shows the inputs of. The others render as
 * ghosts of their own feedback. `sim` by default, so the view follows the
 * emulated device; `feedback` makes it follow the robot instead, switching both
 * the inputs and the feedback the view displays without changing what the
 * store holds.
 *
 * A real device's inputs reach the store only through the World's mirror of
 * that device, which also carries the writes the World delivers to it. A World
 * that does not mirror real devices leaves a view following `feedback` with
 * nothing to read for the `target` instance, which keeps what direct writes
 * gave it.
 */
export type FollowedInstance = "sim" | "feedback";

/** The device id the `target` instance reads under, or `undefined` when the entity has no such device. */
export function followedDeviceId(
  entity: BoundEntity,
  follows: FollowedInstance = "sim",
): string | undefined {
  return entity.instances[follows]?.id;
}

/**
 * The full store key one instance of an entity reads for an animatable named
 * `key`, or `undefined` when nothing in the store feeds that instance:
 * `instanceId` is none of the entity's instances, or it is `target` and the
 * entity has no followed device.
 *
 * | Instance | Store key | Plane |
 * | --- | --- | --- |
 * | `target` | `<followed device id>/<key>.target_position` | the inputs of the device the view follows |
 * | `sim` | `<sim instance id>/<key>.position` | the emulated device's feedback |
 * | `feedback` | `<feedback instance id>/<key>.position` | the real device's feedback |
 *
 * (`target_value` / `value` for a string or a boolean.) There is no entity
 * namespace: what Studio asked of an entity is the input each bound device
 * received, under that device. An emulated and a real device bound to one
 * entity are two devices in the store, in the same shape, so the two device
 * rows differ only by namespace, and the `target` row is one of those devices'
 * input keys.
 */
export function storeKeyFor(
  entity: BoundEntity,
  instanceId: string,
  key: string,
  type: AnimatableValue["type"],
  follows: FollowedInstance = "sim",
): string | undefined {
  const { target, sim, feedback } = entity.instances;
  if (instanceId === target.id) {
    const deviceId = followedDeviceId(entity, follows);
    return deviceId === undefined ? undefined : `${deviceId}/${inputKey(key, type)}`;
  }
  if (instanceId === sim?.id || instanceId === feedback?.id) {
    return `${instanceId}/${feedbackKey(key, type)}`;
  }
  return undefined;
}

/** A spawned entity: its instances, its model's animatables, and the World's key table for them. */
export interface SceneBindingEntry {
  entity: BoundEntity;
  animatables: readonly AnimatableValue[];
  /** From the entity's `spawnEntity`; an animatable it does not name is bound to nothing. */
  keys: KeyTable;
  /** The bound device the main view follows; `sim` when not given. */
  follows?: FollowedInstance;
}

/** Where a write on a target dot key goes: the entity, which routes it to its bound devices. */
export interface TargetBinding {
  /** The entity the write is addressed to. */
  entityId: string;
  /** The input key the write lands on under each bound device, relative to its namespace. */
  key: string;
  /** The animatable the key belongs to, for the value's type. */
  animatable: AnimatableValue;
  /**
   * The full store key the target instance reads for it, the input under the
   * device the view follows; `undefined` when the entity has no followed
   * device. A refused write is undone by reading it.
   */
  storeKey: string | undefined;
}

/**
 * The table between the shared store's keys and the dot keys the scene reads.
 *
 * The scene subscribes to `getLookup(namespace, animatableId)` =
 * `entityId@instanceId.animatableId` and never learns a store key; the store
 * holds `<deviceId>/<key>.<suffix>` and never learns a dot key. This is the
 * only place that knows both spellings: it is built from the spawned entities
 * — their instances, the device each one's view follows, their animatables
 * and the key table the World returned for each — and read in both directions.
 * A store change fans out to every dot key bound to it, and a write on a
 * target dot key resolves to the entity and the input key, which the World
 * delivers to every device bound to the entity. Two instances of two entities
 * can read one device's key, which is why a store key maps to a list.
 *
 * A `target` instance of an entity with no followed device is fed by direct
 * writes only: nothing in the store maps to its dot keys, and `targetFor` still
 * resolves them, since the write is the entity's and reaches whichever devices
 * are bound to it.
 *
 * It is a value: rebuilt whenever the entities, the animatables or the key
 * tables change, never mutated.
 */
export class SceneBinding {
  /** A binding with nothing bound: every lookup answers "unbound". */
  static readonly empty = new SceneBinding([]);

  private readonly dotKeysByStoreKey = new Map<string, string[]>();
  private readonly targetByDotKey = new Map<string, TargetBinding>();

  constructor(entries: Iterable<SceneBindingEntry>) {
    for (const { entity, animatables, keys, follows = "sim" } of entries) {
      const instances = [entity.instances.target, entity.instances.sim, entity.instances.feedback];
      for (const instance of instances) {
        if (!instance) continue;
        const namespace = entityNamespace(entity.id, instance.id);
        for (const animatable of animatables) {
          const key = keys[animatable.id];
          if (key === undefined) continue;
          const dotKey = getLookup(namespace, animatable.id);
          const storeKey = storeKeyFor(entity, instance.id, key, animatable.type, follows);
          if (instance === entity.instances.target) {
            this.targetByDotKey.set(dotKey, {
              entityId: entity.id,
              key: inputKey(key, animatable.type),
              animatable,
              storeKey,
            });
          }
          if (storeKey === undefined) continue;
          const bound = this.dotKeysByStoreKey.get(storeKey);
          if (bound) bound.push(dotKey);
          else this.dotKeysByStoreKey.set(storeKey, [dotKey]);
        }
      }
    }
  }

  /** The dot key an instance reads for an animatable; the scene's spelling. */
  static dotKey(entityId: string, instanceId: string, animatableId: string): string {
    return getLookup(entityNamespace(entityId, instanceId), animatableId);
  }

  /** Every dot key bound to a store key; empty when nothing reads it. */
  dotKeysFor(storeKey: string): readonly string[] {
    return this.dotKeysByStoreKey.get(storeKey) ?? [];
  }

  /**
   * The entity and input key a write on a dot key is addressed to, or
   * `undefined` when the dot key is not a target instance's: a device's
   * feedback is the device's to write.
   */
  targetFor(dotKey: string): TargetBinding | undefined {
    return this.targetByDotKey.get(dotKey);
  }

  /** Every store key something reads, for diagnostics and tests. */
  get storeKeys(): readonly string[] {
    return [...this.dotKeysByStoreKey.keys()];
  }
}
