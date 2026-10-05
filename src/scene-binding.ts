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
 * The name an animatable's keys carry in the shared store, by animatable id,
 * as the World returns it from `spawnEntity`. The World is the authority on
 * the rule (an animatable's `pub.output` when it is non-empty and unique
 * within the entity, else its id); nothing on this side recomputes it, so a
 * request and the feedback it produces line up key for key whatever the rule
 * does for an entity.
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
 * The key, relative to an entity's namespace, that holds what is asked of an
 * animatable named `key`: `<key>.target_position` for a number,
 * `<key>.target_value` for a string or a boolean. Numbers keep `position`
 * because arora's HALs, the ROS 2 HAL and Studio's own device commands all
 * spell it that way.
 */
export function requestKey(key: string, type: AnimatableValue["type"]): string {
  return `${key}.${type === "number" ? "target_position" : "target_value"}`;
}

/**
 * The key, relative to a device's namespace, that holds what the device did
 * with an animatable named `key`: `<key>.position` for a number, `<key>.value`
 * otherwise. It pairs with {@link requestKey} suffix for suffix, so "what was
 * asked" and "what the device did" are the same key under two namespaces; the
 * World's emulated device mirrors one onto the other for every type.
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

/** An entity's instance, by the field that names its role. */
export interface BoundInstances {
  /** The instance that shows the request: what Studio asks of the entity. */
  target: { id: string };
  /** An emulated device attached to the entity; its id is the device's namespace. */
  sim?: { id: string };
  /** A real device attached to the entity; its id is the device's namespace. */
  feedback?: { id: string };
}

/** The part of a project entity the binding reads: its id and its instances. */
export interface BoundEntity {
  id: string;
  instances: BoundInstances;
}

/**
 * The full store key one instance of an entity reads for an animatable named
 * `key`, or `undefined` when `instanceId` is none of the entity's instances.
 *
 * | Instance | Store key | Plane |
 * | --- | --- | --- |
 * | `target` | `<entityId>/<key>.target_position` | the request |
 * | `sim` | `<sim instance id>/<key>.position` | the emulated device's feedback |
 * | `feedback` | `<feedback instance id>/<key>.position` | the real device's feedback |
 *
 * (`target_value` / `value` for a string or a boolean.) An emulated and a real
 * device attached to one entity are two devices in the store, in the same shape,
 * so the two device rows differ only by namespace.
 */
export function storeKeyFor(
  entity: BoundEntity,
  instanceId: string,
  key: string,
  type: AnimatableValue["type"],
): string | undefined {
  const { target, sim, feedback } = entity.instances;
  if (instanceId === target.id) return `${entity.id}/${requestKey(key, type)}`;
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
}

/** Where a write on a target dot key lands: the entity's request key. */
export interface RequestBinding {
  /** The entity whose namespace holds the request. */
  entityId: string;
  /** The request key, relative to that namespace. */
  key: string;
  /** The animatable the key belongs to, for the value's type. */
  animatable: AnimatableValue;
}

/**
 * The table between the shared store's keys and the dot keys the scene reads.
 *
 * The scene subscribes to `getLookup(namespace, animatableId)` =
 * `entityId@instanceId.animatableId` and never learns a store key; the store
 * holds `<namespace>/<key>.<suffix>` and never learns a dot key. This is the
 * only place that knows both spellings: it is built from the spawned entities
 * — their instances, their animatables and the key table the World returned
 * for each — and read in both directions. A store change fans out to every
 * dot key bound to it, and a write on a dot key resolves to the entity's
 * request key. Two instances of two entities can read one device's key, which
 * is why a store key maps to a list.
 *
 * It is a value: rebuilt whenever the entities, the animatables or the key
 * tables change, never mutated.
 */
export class SceneBinding {
  /** A binding with nothing bound: every lookup answers "unbound". */
  static readonly empty = new SceneBinding([]);

  private readonly dotKeysByStoreKey = new Map<string, string[]>();
  private readonly requestByDotKey = new Map<string, RequestBinding>();

  constructor(entries: Iterable<SceneBindingEntry>) {
    for (const { entity, animatables, keys } of entries) {
      const instances = [entity.instances.target, entity.instances.sim, entity.instances.feedback];
      for (const instance of instances) {
        if (!instance) continue;
        const namespace = entityNamespace(entity.id, instance.id);
        for (const animatable of animatables) {
          const key = keys[animatable.id];
          if (key === undefined) continue;
          const storeKey = storeKeyFor(entity, instance.id, key, animatable.type);
          if (storeKey === undefined) continue;
          const dotKey = getLookup(namespace, animatable.id);
          const bound = this.dotKeysByStoreKey.get(storeKey);
          if (bound) bound.push(dotKey);
          else this.dotKeysByStoreKey.set(storeKey, [dotKey]);
          if (instance === entity.instances.target) {
            this.requestByDotKey.set(dotKey, {
              entityId: entity.id,
              key: requestKey(key, animatable.type),
              animatable,
            });
          }
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
   * The request key a write on a dot key lands on, or `undefined` when the dot
   * key is not a target instance's: a device's feedback is the device's to write.
   */
  requestKeyFor(dotKey: string): RequestBinding | undefined {
    return this.requestByDotKey.get(dotKey);
  }

  /** Every store key something reads, for diagnostics and tests. */
  get storeKeys(): readonly string[] {
    return [...this.dotKeysByStoreKey.keys()];
  }
}
