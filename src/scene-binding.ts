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
 * The table a `spawnEntity` or an `inputKeys` result holds, or `undefined`
 * when the result is not an object of strings keyed by animatable id.
 */
export function parseKeyTable(json: string): KeyTable | undefined {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const entries = Object.entries(parsed);
  if (!entries.every(([, key]) => typeof key === "string")) return undefined;
  return Object.fromEntries(entries) as KeyTable;
}

/**
 * The input key of each animatable, relative to a device's namespace, by
 * animatable id, as the World's `inputKeys` answers it. For an entity, the key
 * its writes address; for a device bound to one, the key the entity's input
 * lands on there — `<key>/target.<c>`, `<key>.target_<c>` or the bare `<key>`,
 * an axis spelled from its group's key with the axis after the component in
 * the first form, which the World resolves per device from what the device
 * lists — so nothing on this side spells an input. An animatable it does not
 * name takes no write (an entity) or is not driven (a device).
 */
export type InputKeys = Readonly<Record<string, string>>;

/**
 * The feedback key of each animatable, relative to a device's namespace, by
 * animatable id, as the World's `feedbackKeys` answers it for a device: what
 * the device did with it, `<key>.position` for a number and `<key>.value`
 * otherwise, an axis read under whichever spelling the device publishes
 * (`<group key>.position.<axis>` or `<group key>.<axis>.position`).
 */
export type FeedbackKeys = Readonly<Record<string, string>>;

/**
 * The namespace a scene instance of an entity reads under: `entityId@instanceId`.
 * Every per-instance dot key in the values store starts with it.
 */
export function entityNamespace(entityId: string, instanceId: string): string {
  return `${entityId}@${instanceId}`;
}

/**
 * The entity a scene instance's namespace belongs to, the inverse of
 * {@link entityNamespace}. A namespace that names no instance is the
 * entity's own id.
 */
export function namespaceEntity(namespace: string): string {
  const at = namespace.indexOf("@");
  return at === -1 ? namespace : namespace.slice(0, at);
}

/** An entity's instances, by the field that names each one's role. */
export interface BoundInstances {
  /** The instance that shows the inputs of the device the view follows. */
  target: { id: string };
  /** An emulated device bound to the entity; its id is the device's namespace. */
  sim?: { id: string };
  /** The instance that shows the real device bound to the entity ({@link BoundEntity.realDeviceId}). */
  feedback?: { id: string };
}

/**
 * The part of a project entity the binding reads: its id, its instances, and
 * the real device bound to it.
 */
export interface BoundEntity {
  id: string;
  instances: BoundInstances;
  /**
   * The id of the real device bound to the entity, its namespace in the store,
   * which the `feedback` instance shows. A real device's id is its own (its
   * uid), unlike an emulated device's, which is the id of the `sim` instance
   * that shows it.
   */
  realDeviceId?: string;
}

/**
 * Which of an entity's bound devices the `target` instance reads the inputs
 * of: `sim` (the default) for the emulated device, `feedback` for the real
 * one. It changes only the store keys of the `target` row; the `sim` and
 * `feedback` instances always read their own device's feedback, and what the
 * store holds is the same either way.
 *
 * A real device's inputs reach the store only through the World's mirror of
 * that device, as the device publishes them once the World's writes reach it.
 * An entity with no real device bound leaves a `target` instance that reads
 * `feedback` with nothing in the store, so it keeps what direct writes gave it.
 *
 * Studio offers no choice of it yet: every entity's view follows its emulated
 * device.
 */
export type FollowedInstance = "sim" | "feedback";

/**
 * The namespace of the device an instance of the entity shows: the `sim`
 * instance's id for the emulated device, the real device's id for the
 * `feedback` instance — `undefined` when the entity has no such instance or no
 * real device is bound to it.
 */
function deviceIdOf(entity: BoundEntity, instance: FollowedInstance): string | undefined {
  if (instance === "sim") return entity.instances.sim?.id;
  return entity.instances.feedback ? entity.realDeviceId : undefined;
}

/** The device id the `target` instance reads under, or `undefined` when the entity has no such device. */
export function followedDeviceId(
  entity: BoundEntity,
  follows: FollowedInstance = "sim",
): string | undefined {
  return deviceIdOf(entity, follows);
}

/** The keys, relative to a device's namespace, one animatable is read from on each device bound to its entity, by device id. */
export interface AnimatableKeys {
  /** Its feedback key on each device; none before the World knows it (a real device not yet paired). */
  feedback: Readonly<Record<string, string | undefined>>;
  /** Its input key on each device; none on a device that does not drive it. */
  inputs: Readonly<Record<string, string | undefined>>;
}

/**
 * The full store key one instance of an entity reads for an animatable, or
 * `undefined` when nothing in the store feeds that instance: `instanceId` is
 * none of the entity's instances, or it is `target` and the entity has no
 * followed device, or that device does not drive the animatable.
 *
 * | Instance | Store key | Plane |
 * | --- | --- | --- |
 * | `target` | `<followed device id>/<its input key there>` | the inputs of the device the view follows |
 * | `sim` | `<sim instance id>/<its feedback key there>` | the emulated device's feedback |
 * | `feedback` | `<real device id>/<its feedback key there>` | the real device's feedback |
 *
 * There is no entity namespace: what
 * Studio asked of an entity is the input each bound device received, under
 * that device, in the form that device takes it. An emulated and a real device
 * bound to one entity are two devices in the store, so the two device rows
 * differ only by namespace, and the `target` row is one of those devices'
 * input keys.
 */
export function storeKeyFor(
  entity: BoundEntity,
  instanceId: string,
  keys: AnimatableKeys,
  follows: FollowedInstance = "sim",
): string | undefined {
  const { target, sim, feedback } = entity.instances;
  if (instanceId === target.id) {
    const deviceId = followedDeviceId(entity, follows);
    const input = deviceId === undefined ? undefined : keys.inputs[deviceId];
    return input === undefined ? undefined : `${deviceId}/${input}`;
  }
  const shown =
    instanceId === sim?.id ? "sim" : instanceId === feedback?.id ? "feedback" : undefined;
  const deviceId = shown && deviceIdOf(entity, shown);
  const read = deviceId === undefined ? undefined : keys.feedback[deviceId];
  return read === undefined ? undefined : `${deviceId}/${read}`;
}

/** A spawned entity: its instances, its model's animatables, and the World's key tables for them. */
export interface SceneBindingEntry {
  entity: BoundEntity;
  animatables: readonly AnimatableValue[];
  /** From the entity's `spawnEntity`; an animatable it does not name is bound to nothing. */
  keys: KeyTable;
  /** The World's `inputKeys` of the entity: the key each animatable's writes address. */
  inputs: InputKeys;
  /**
   * The World's `inputKeys` of each device bound to the entity, by device id:
   * what the `target` instance reads under the device it follows.
   */
  deviceInputs: Readonly<Record<string, InputKeys>>;
  /**
   * The World's `feedbackKeys` of each device bound to the entity, by device
   * id: what the `sim` and `feedback` instances read under their device.
   */
  deviceFeedback: Readonly<Record<string, FeedbackKeys>>;
  /** Which bound device's inputs the `target` instance reads; `sim` when not given. */
  follows?: FollowedInstance;
  /**
   * The inputs each bound device opens beyond the entity's animatables, by
   * device id, relative to the device (the World's `deviceInputs`). The
   * `target` instance shows each one under {@link undeclaredInputId}, read
   * from the followed device when it opens it, else from the first device
   * that does; a write on it goes to every device that opens it.
   */
  undeclaredInputs?: Readonly<Record<string, readonly string[]>>;
}

/**
 * The id under which an entity's `target` instance shows an input a bound
 * device opens beyond the entity's animatables, `key` as the device lists it:
 * the dot key's last segment, as an animatable's id is for its input. The
 * prefix keeps it apart from every animatable id.
 */
export function undeclaredInputId(key: string): string {
  return `${UNDECLARED_INPUT_PREFIX}${key}`;
}

const UNDECLARED_INPUT_PREFIX = "device-input:";

/**
 * Where a write on a target dot key goes: for an animatable's input, the
 * entity, which routes it to its bound devices; for an input devices open
 * beyond the entity's animatables, those devices.
 */
export interface TargetBinding {
  /** The entity the write is addressed to. */
  entityId: string;
  /**
   * The entity's input key the write addresses, which the World routes to
   * each bound device's own; for an input beyond the animatables, the key as
   * the devices list it.
   */
  key: string;
  /** The animatable the key belongs to, for the value's type; none for an input beyond the animatables. */
  animatable?: AnimatableValue;
  /**
   * The full store key the target instance reads for it, the input under the
   * device the view follows; `undefined` when the entity has no followed
   * device. A refused write is undone by reading it.
   */
  storeKey: string | undefined;
  /**
   * For an input beyond the entity's animatables: the bound devices that open
   * it, each written `key` directly. Absent for an animatable's input.
   */
  devices?: readonly string[];
}

/**
 * The table between the shared store's keys and the dot keys the scene reads.
 *
 * The scene subscribes to `getLookup(namespace, animatableId)` =
 * `entityId@instanceId.animatableId` and never learns a store key; the store
 * holds `<deviceId>/<relative key>` and never learns a dot key. This is the
 * only place that knows both spellings: it is built from the spawned entities
 * — their instances, the device each one's view follows, their animatables,
 * the key table the World returned for each and the input keys it resolved
 * on each device — and read in both directions.
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
 * An input a bound device opens beyond the entity's animatables is shown on
 * the `target` instance under {@link undeclaredInputId}, read from the followed
 * device when it opens it, else from the first device that does; its write is
 * no entity's, so `targetFor` names the devices that open it.
 *
 * It is a value: rebuilt whenever the entities, the animatables, the key
 * tables or a device's input keys change, never mutated.
 *
 * **The seam a view reads.** What a view needs from the binding is the list of
 * store keys it shows ({@link storeKeys}) and, for each, the features that
 * show it ({@link dotKeysFor}): strings, with no Studio type in them. Studio's
 * types — the entity, its instances and their roles, the device a view
 * follows, the animatables, the key table — build the binding and stay on
 * Studio's side. The three.js scene reads those keys as the projection writes
 * them into the values store, by dot key; a Bevy view linked into the World's
 * wasm module reads the same store keys from the World's store in Rust, and
 * the projection is what retires. A write goes the other way, through
 * {@link targetFor}, to the entity the World routes it from.
 */
export class SceneBinding {
  /** A binding with nothing bound: every lookup answers "unbound". */
  static readonly empty = new SceneBinding([]);

  private readonly dotKeysByStoreKey = new Map<string, string[]>();
  private readonly targetByDotKey = new Map<string, TargetBinding>();

  constructor(entries: Iterable<SceneBindingEntry>) {
    for (const entry of entries) {
      const { entity, animatables, keys, inputs, deviceInputs, deviceFeedback } = entry;
      const follows = entry.follows ?? "sim";
      const onDevices = (tables: Readonly<Record<string, KeyTable>>, id: string) =>
        Object.fromEntries(
          Object.entries(tables).map(([deviceId, table]) => [deviceId, table[id]]),
        );
      const instances = [entity.instances.target, entity.instances.sim, entity.instances.feedback];
      for (const instance of instances) {
        if (!instance) continue;
        const namespace = entityNamespace(entity.id, instance.id);
        for (const animatable of animatables) {
          const key = keys[animatable.id];
          if (key === undefined) continue;
          const dotKey = getLookup(namespace, animatable.id);
          const animatableKeys: AnimatableKeys = {
            feedback: onDevices(deviceFeedback, animatable.id),
            inputs: onDevices(deviceInputs, animatable.id),
          };
          const storeKey = storeKeyFor(entity, instance.id, animatableKeys, follows);
          const input = inputs[animatable.id];
          if (instance === entity.instances.target && input !== undefined) {
            this.targetByDotKey.set(dotKey, {
              entityId: entity.id,
              key: input,
              animatable,
              storeKey,
            });
          }
          if (storeKey === undefined) continue;
          this.bindStoreKey(storeKey, dotKey);
        }
      }
      this.bindUndeclaredInputs(entry, follows);
    }
  }

  /** Has `dotKey` show what `storeKey` holds. */
  private bindStoreKey(storeKey: string, dotKey: string): void {
    const bound = this.dotKeysByStoreKey.get(storeKey);
    if (bound) bound.push(dotKey);
    else this.dotKeysByStoreKey.set(storeKey, [dotKey]);
  }

  /**
   * Binds the inputs an entity's devices open beyond its animatables on its
   * `target` instance: each shows the followed device's key when that device
   * opens it, else the first opening device's, and a write on it goes to
   * every device that opens it.
   */
  private bindUndeclaredInputs(entry: SceneBindingEntry, follows: FollowedInstance): void {
    const { entity, undeclaredInputs = {} } = entry;
    const namespace = entityNamespace(entity.id, entity.instances.target.id);
    const followed = followedDeviceId(entity, follows);
    const openedBy = new Map<string, string[]>();
    for (const [deviceId, keys] of Object.entries(undeclaredInputs)) {
      for (const key of keys) {
        const devices = openedBy.get(key);
        if (devices) devices.push(deviceId);
        else openedBy.set(key, [deviceId]);
      }
    }
    for (const [key, devices] of openedBy) {
      const shown = followed !== undefined && devices.includes(followed) ? followed : devices[0];
      const storeKey = `${shown}/${key}`;
      const dotKey = getLookup(namespace, undeclaredInputId(key));
      this.targetByDotKey.set(dotKey, { entityId: entity.id, key, storeKey, devices });
      this.bindStoreKey(storeKey, dotKey);
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

  /** Every store key something reads. */
  get storeKeys(): readonly string[] {
    return [...this.dotKeysByStoreKey.keys()];
  }
}
