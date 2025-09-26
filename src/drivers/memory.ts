import { defineDriver } from "./utils";

const DRIVER_NAME = "memory";

export default defineDriver<void, Map<string, any>>(() => {
  const data = new Map<string, any>();

  return {
    name: DRIVER_NAME,
    getInstance: () => data,
    hasItem(key) {
      return data.has(key);
    },
    getItem(key) {
      return data.get(key) ?? null;
    },
    getItemRaw(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    setItemRaw(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
    getKeys() {
      return [...data.keys()];
    },
    clear() {
      data.clear();
    },
    dispose() {
      data.clear();
    },

    // Synchronous API methods
    hasItemSync(key) {
      return data.has(key);
    },
    getItemSync(key) {
      return data.get(key) ?? null;
    },
    getItemRawSync(key) {
      return data.get(key) ?? null;
    },
    setItemSync(key, value) {
      data.set(key, value);
    },
    setItemRawSync(key, value) {
      data.set(key, value);
    },
    removeItemSync(key) {
      data.delete(key);
    },
    getKeysSync() {
      return [...data.keys()];
    },
    clearSync() {
      data.clear();
    },
  };
});
