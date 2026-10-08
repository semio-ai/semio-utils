import { describe, expect, it, vi } from "vitest";
import type { RawValue } from "./animated-values";
import { watchKey, type StateChange } from "./data-store";
import { createValuesStore, valuesDataStore } from "./values-store";

function setUp(initial: [string, RawValue | undefined][] = []) {
  const values = createValuesStore();
  values.setState({ values: new Map(initial) });
  return { values, store: valuesDataStore(values) };
}

const write = (values: ReturnType<typeof createValuesStore>, key: string, value?: RawValue) =>
  values.getState().updateValues(new Map([[key, value]]));

/** A change's content, comparable with `toEqual`. */
const plain = (change: StateChange) => ({
  set: Object.fromEntries(change.set),
  unset: [...change.unset].sort(),
});

describe("valuesDataStore", () => {
  it("starts a subscriber from the whole state, before subscribe returns", () => {
    const { store } = setUp([
      ["a.x", 0.5],
      ["a.name", "on"],
      ["a.lit", true],
    ]);
    const changes: StateChange[] = [];
    store.subscribe((change) => changes.push(change));
    expect(changes.map(plain)).toEqual([
      { set: { "a.x": { f64: 0.5 }, "a.name": { str: "on" }, "a.lit": { bool: true } }, unset: [] },
    ]);
  });

  it("hands a subscriber each change: keys written, keys removed, and nothing for a write that changes nothing", () => {
    const { values, store } = setUp([
      ["a.x", 0.5],
      ["a.y", 1],
    ]);
    const changes: StateChange[] = [];
    store.subscribe((change) => changes.push(change));
    changes.length = 0;

    write(values, "a.x", 0.75);
    write(values, "a.z", "new");
    write(values, "a.y", undefined);
    write(values, "a.x", 0.75);

    expect(changes.map(plain)).toEqual([
      { set: { "a.x": { f64: 0.75 } }, unset: [] },
      { set: { "a.z": { str: "new" } }, unset: [] },
      { set: {}, unset: ["a.y"] },
    ]);
  });

  it("reads a key holding no scalar as absent, and its replacement by one as a removal", () => {
    const vector = { x: 1, y: 2, z: 3 };
    const { values, store } = setUp([["a.v", vector]]);
    const changes: StateChange[] = [];
    store.subscribe((change) => changes.push(change));
    expect(plain(changes[0])).toEqual({ set: {}, unset: [] });
    expect(store.read(["a.v"])).toEqual([undefined]);

    write(values, "a.s", 1);
    write(values, "a.s", { x: 0, y: 0 });
    expect(changes.slice(1).map(plain)).toEqual([
      { set: { "a.s": { f64: 1 } }, unset: [] },
      { set: {}, unset: ["a.s"] },
    ]);
  });

  it("computes each change once for every subscriber, and stops watching when the last one leaves", () => {
    const { values, store } = setUp([["a.x", 0]]);
    const first: StateChange[] = [];
    const second: StateChange[] = [];
    const stopFirst = store.subscribe((change) => first.push(change));
    const stopSecond = store.subscribe((change) => second.push(change));
    // The whole state two subscribers start from, while the values have not moved, is one object.
    expect(second[0]).toBe(first[0]);

    write(values, "a.x", 1);
    expect(second[1]).toBe(first[1]);

    stopFirst();
    write(values, "a.x", 2);
    expect(first).toHaveLength(2);
    expect(second.map(plain).at(-1)).toEqual({ set: { "a.x": { f64: 2 } }, unset: [] });

    stopSecond();
    write(values, "a.x", 3);
    expect(second).toHaveLength(3);
    // A subscriber arriving later starts from the values as they are now.
    const third: StateChange[] = [];
    store.subscribe((change) => third.push(change));
    expect(plain(third[0])).toEqual({ set: { "a.x": { f64: 3 } }, unset: [] });
  });

  it("stops watching the values store when the last subscriber leaves, and starts again for the next", () => {
    const { values, store } = setUp([["a.x", 0]]);
    const unsubscribes: ReturnType<typeof vi.fn>[] = [];
    const subscribe = values.subscribe.bind(values) as (...args: unknown[]) => () => void;
    vi.spyOn(values, "subscribe").mockImplementation(((...args: unknown[]) => {
      const unsubscribe = vi.fn(subscribe(...args));
      unsubscribes.push(unsubscribe);
      return unsubscribe;
    }) as typeof values.subscribe);

    const stopFirst = store.subscribe(() => {});
    const stopSecond = store.subscribe(() => {});
    expect(unsubscribes).toHaveLength(1);
    stopFirst();
    expect(unsubscribes[0]).not.toHaveBeenCalled();
    stopSecond();
    expect(unsubscribes[0]).toHaveBeenCalledOnce();

    const later: StateChange[] = [];
    store.subscribe((change) => later.push(change));
    write(values, "a.x", 1);
    expect(later.map(plain)).toEqual([
      { set: { "a.x": { f64: 0 } }, unset: [] },
      { set: { "a.x": { f64: 1 } }, unset: [] },
    ]);
  });

  it("hands a write made while handling a change to every subscriber after that change", () => {
    const { values, store } = setUp([["a.x", 0]]);
    const first: unknown[] = [];
    const second: unknown[] = [];
    watchKey(store, "a.x", 0, (value) => {
      first.push(value);
      if (value === 1) write(values, "a.x", 2);
    });
    watchKey(store, "a.x", 0, (value) => second.push(value));

    write(values, "a.x", 1);

    expect(first).toEqual([0, 1, 2]);
    expect(second).toEqual([0, 1, 2]);
  });

  it("hands a subscriber the write it makes in its first call", () => {
    const { values, store } = setUp();
    const changes: StateChange[] = [];
    store.subscribe((change) => {
      changes.push(change);
      if (changes.length === 1) write(values, "a.k", true);
    });
    expect(changes.map(plain)).toEqual([
      { set: {}, unset: [] },
      { set: { "a.k": { bool: true } }, unset: [] },
    ]);
  });

  it("does not call a subscriber that left while a change was being handed on", () => {
    const { values, store } = setUp();
    let calls = 0;
    let stopSecond = () => {};
    store.subscribe(() => stopSecond());
    stopSecond = store.subscribe(() => calls++);
    calls = 0;

    write(values, "a.x", 1);

    expect(calls).toBe(0);
  });

  it("does not report again a key that holds NaN, nor a write that changes nothing", () => {
    const { values, store } = setUp([["a.n", Number.NaN]]);
    const changes: StateChange[] = [];
    store.subscribe((change) => changes.push(change));
    changes.length = 0;

    write(values, "a.other", 1);
    // `setTrackValue` makes a new map even when the value is the same.
    values.getState().setTrackValue("a.other", 1);

    expect(changes.map(plain)).toEqual([{ set: { "a.other": { f64: 1 } }, unset: [] }]);
  });

  it("reports as removed only a key that held a scalar", () => {
    const { values, store } = setUp([["a.s", 1]]);
    const changes: StateChange[] = [];
    store.subscribe((change) => changes.push(change));
    changes.length = 0;

    write(values, "a.v", { x: 1, y: 2 });
    write(values, "a.v", undefined);
    write(values, "a.s", undefined);

    expect(changes.map(plain)).toEqual([{ set: {}, unset: ["a.s"] }]);
  });

  it("reads several keys at once, an absent one as undefined", () => {
    const { store } = setUp([
      ["a.x", 0.5],
      ["a.on", false],
    ]);
    expect(store.read(["a.on", "a.missing", "a.x"])).toEqual([
      { bool: false },
      undefined,
      { f64: 0.5 },
    ]);
  });

  it("writes and removes a key through its slot, and refuses a value that is no scalar", () => {
    const { values, store } = setUp();
    const slot = store.slot("a.x");
    expect(slot.get()).toBeUndefined();

    slot.set({ f64: 0.25 });
    expect(values.getState().values.get("a.x")).toBe(0.25);
    expect(slot.get()).toEqual({ f64: 0.25 });
    // A device may publish a number as any width; the values store keeps the number.
    slot.set({ f32: 0.5 });
    expect(values.getState().values.get("a.x")).toBe(0.5);

    slot.set(undefined);
    expect(values.getState().values.has("a.x")).toBe(false);

    expect(() => slot.set({ struct: { id: "t", fields: [] } })).toThrow(/scalars/);
    expect(values.getState().values.has("a.x")).toBe(false);
  });
});

describe("watchKey", () => {
  it("gives the key's scalar, or the fallback, now and at each change of that value only", () => {
    const { values, store } = setUp([["a.x", 0.5]]);
    const seen: unknown[] = [];
    const stop = watchKey(store, "a.x", 0, (value) => seen.push(value));
    expect(seen).toEqual([0.5]);

    write(values, "a.other", 1);
    write(values, "a.x", 0.5);
    expect(seen).toEqual([0.5]);

    write(values, "a.x", 0.75);
    write(values, "a.x", undefined);
    write(values, "a.x", { x: 1, y: 1 });
    write(values, "a.x", 0);
    write(values, "a.x", 1);
    // A removal and a structure both read as the fallback, so only the first of them is seen.
    expect(seen).toEqual([0.5, 0.75, 0, 1]);

    stop();
    write(values, "a.x", 2);
    expect(seen).toEqual([0.5, 0.75, 0, 1]);
  });

  it("goes back to the fallback when the key is removed", () => {
    const { values, store } = setUp([["a.x", 0.5]]);
    const seen: unknown[] = [];
    watchKey(store, "a.x", 0, (value) => seen.push(value));
    write(values, "a.x", undefined);
    expect(seen).toEqual([0.5, 0]);
  });

  it("starts from the fallback for an absent key", () => {
    const { values, store } = setUp();
    const seen: unknown[] = [];
    watchKey(store, "a.name", "idle", (value) => seen.push(value));
    write(values, "a.name", "speaking");
    expect(seen).toEqual(["idle", "speaking"]);
  });
});
