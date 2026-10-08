import { createContext, useContext } from "react";
import { fromTaggedValue, type ScalarValue, type TaggedValue } from "./scene-binding";

/**
 * An arora `Value` as it crosses the JS boundary: the externally tagged JSON
 * of the Rust enum, tagged by its serde name (`{ "f64": 0.5 }`,
 * `{ "str": "on" }`, `{ "struct": … }`). An animatable's key holds one of the
 * scalar tags ({@link TaggedValue}); a device's other keys may hold any
 * variant.
 */
export type AroraValue = TaggedValue | Readonly<Record<string, unknown>>;

/** A change applied to a {@link DataStore}: arora's `StateChange`. */
export interface StateChange {
  /** The keys written, each with its new value. */
  readonly set: ReadonlyMap<string, AroraValue>;
  /** The keys removed. */
  readonly unset: ReadonlySet<string>;
}

/**
 * One key's cell: arora's `Slot`. Reading and writing it coincide with the
 * store's own read and write of that key.
 */
export interface Slot {
  get(): AroraValue | undefined;
  /** Writes the key, or removes it given `undefined`; subscribers see the change. */
  set(value: AroraValue | undefined): void;
}

/**
 * Arora's data store, as a package reads it: the `DataStore` interface of
 * arora-types (read, slot, subscribe) with its values in their JSON form.
 * A host injects one through {@link DataStoreContext}: Studio its values
 * store, a story or another app whatever store it runs, the World's store
 * once the scene reads it directly. A package never learns which.
 */
export interface DataStore {
  /** Each key's current value, `undefined` where the key is absent. */
  read(keys: readonly string[]): (AroraValue | undefined)[];
  /** The cell of `key`, resolved once. */
  slot(key: string): Slot;
  /**
   * Calls `listener` with every change applied from now on. Its first call,
   * made before `subscribe` returns, is the store's whole current state, so a
   * subscriber starts from the full picture with no separate read that could
   * miss a change. Returns the function that ends the subscription.
   */
  subscribe(listener: (change: StateChange) => void): () => void;
}

/** The store the scene and Vizij packages read values from. */
export const DataStoreContext = createContext<DataStore | null>(null);

/** The store the host injected; throws when no {@link DataStoreContext} provides one. */
export function useDataStore(): DataStore {
  const store = useContext(DataStoreContext);
  if (!store) throw new Error("Missing DataStoreContext provider in the tree");
  return store;
}

/**
 * Calls `onValue` with the scalar `key` holds, `fallback` when the key is
 * absent or holds no scalar: once now, then each time that value changes.
 * Returns the function that stops it. This is how an animatable's key is
 * read: a structure under it is the key's owner's to type, and reads as
 * nothing.
 */
export function watchKey(
  store: DataStore,
  key: string,
  fallback: ScalarValue,
  onValue: (value: ScalarValue) => void,
): () => void {
  let current = fromTaggedValue(store.slot(key).get()) ?? fallback;
  onValue(current);
  return store.subscribe((change) => {
    let next: ScalarValue;
    if (change.set.has(key)) next = fromTaggedValue(change.set.get(key)) ?? fallback;
    else if (change.unset.has(key)) next = fallback;
    else return;
    if (Object.is(next, current)) return;
    current = next;
    onValue(next);
  });
}
