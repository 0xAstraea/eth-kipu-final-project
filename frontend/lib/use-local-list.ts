"use client";

import { useSyncExternalStore } from "react";

type Listener = () => void;

type Store<T> = {
  subscribe: (listener: Listener) => () => void;
  get: () => T[];
  set: (list: T[]) => void;
  add: (item: T) => void;
  remove: (predicate: (item: T) => boolean) => void;
};

const EMPTY: never[] = [];
const stores = new Map<string, Store<unknown>>();

function createStore<T>(key: string): Store<T> {
  let cache: T[] | null = null;
  const listeners = new Set<Listener>();

  const read = (): T[] => {
    if (cache === null) {
      try {
        cache = JSON.parse(window.localStorage.getItem(key) ?? "[]") as T[];
      } catch {
        cache = [];
      }
    }
    return cache;
  };

  const emit = () => {
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get() {
      return typeof window === "undefined" ? (EMPTY as T[]) : read();
    },
    set(list) {
      cache = list;
      if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(list));
      emit();
    },
    add(item) {
      this.set([...this.get(), item]);
    },
    remove(predicate) {
      this.set(this.get().filter((item) => !predicate(item)));
    }
  };
}

function getStore<T>(key: string): Store<T> {
  let store = stores.get(key) as Store<T> | undefined;
  if (!store) {
    store = createStore<T>(key);
    stores.set(key, store as Store<unknown>);
  }
  return store;
}

/** Hydration-safe list persisted in localStorage, exposed through useSyncExternalStore. */
export function useLocalList<T>(key: string) {
  const store = getStore<T>(key);
  const list = useSyncExternalStore(store.subscribe, store.get, () => EMPTY as T[]);
  return {
    list,
    set: store.set.bind(store),
    add: store.add.bind(store),
    remove: store.remove.bind(store)
  };
}
