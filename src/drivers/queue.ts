import type {
  Driver,
  QueueOptions,
  TransactionOptions,
  WatchCallback,
  Unwatch,
} from "../types";
import { defineDriver } from "./utils";

const DRIVER_NAME = "queue";

interface QueuedOperation {
  type: "set" | "remove";
  key: string;
  value?: any;
  options?: TransactionOptions;
  timestamp: number;
  isRaw?: boolean;
}

interface QueueContext {
  queue: Map<string, QueuedOperation>;
  flushTimer?: NodeJS.Timeout;
  flushing: boolean;
  disposed: boolean;
  pendingFlush?: Promise<void>;
}

export interface QueueDriverOptions extends QueueOptions {
  driver: Driver;
}

const defaultOptions: Required<Omit<QueueOptions, "driver">> = {
  batchSize: 100,
  flushInterval: 1000,
  maxQueueSize: 1000,
  mergeUpdates: true,
};

export default defineDriver<QueueDriverOptions, QueueContext>((opts) => {
  const options = { ...defaultOptions, ...opts };
  const { driver } = options;

  const context: QueueContext = {
    queue: new Map(),
    flushing: false,
    disposed: false,
  };

  const scheduleFlush = () => {
    if (context.flushTimer || context.flushing || context.disposed) {
      return;
    }

    context.flushTimer = setTimeout(() => {
      context.flushTimer = undefined;
      flushQueue();
    }, options.flushInterval);
  };

  const flushQueue = async () => {
    if (context.disposed) {
      return;
    }
    // If already flushing, return the pending flush promise so callers can await it
    if (context.flushing) {
      return context.pendingFlush;
    }
    if (context.queue.size === 0) {
      return;
    }

    context.flushing = true;

    const flushPromise = (async () => {
      const operations = [...context.queue.values()].sort(
        (a, b) => a.timestamp - b.timestamp
      );
      context.queue.clear();

      const setOperations: QueuedOperation[] = [];
      const removeOperations: { key: string; options?: TransactionOptions }[] =
        [];

      for (const op of operations) {
        if (op.type === "set" && op.value !== undefined) {
          setOperations.push(op);
        } else if (op.type === "remove") {
          removeOperations.push({
            key: op.key,
            options: op.options,
          });
        }
      }

      if (setOperations.length > 0) {
        if (
          driver.setItems &&
          setOperations.length > 1 &&
          setOperations.every((op) => !op.isRaw)
        ) {
          // Try batch operation, fall back to per-item writes if it fails
          try {
            await driver.setItems(
              setOperations.map((op) => ({
                key: op.key,
                value: op.value,
                options: op.options,
              }))
            );
          } catch {
            // Fallback to per-item writes
            await Promise.all(
              setOperations.map((op) => {
                if (op.isRaw && driver.setItemRaw) {
                  return driver.setItemRaw(op.key, op.value, op.options || {});
                }
                return driver.setItem?.(op.key, op.value, op.options || {});
              })
            );
          }
        } else {
          await Promise.all(
            setOperations.map((op) => {
              if (op.isRaw && driver.setItemRaw) {
                return driver.setItemRaw(op.key, op.value, op.options || {});
              }
              return driver.setItem?.(op.key, op.value, op.options || {});
            })
          );
        }
      }

      if (removeOperations.length > 0) {
        await Promise.all(
          removeOperations.map((op) =>
            driver.removeItem?.(op.key, op.options || {})
          )
        );
      }
    })().finally(() => {
      context.flushing = false;
      context.pendingFlush = undefined;

      if (context.queue.size > 0 && !context.disposed) {
        scheduleFlush();
      }
    });

    context.pendingFlush = flushPromise;
    return flushPromise;
  };

  const flushQueueSync = () => {
    if (context.flushing || context.queue.size === 0 || context.disposed) {
      return;
    }

    // Clear any pending flush timer
    if (context.flushTimer) {
      clearTimeout(context.flushTimer);
      context.flushTimer = undefined;
    }

    context.flushing = true;

    try {
      const operations = [...context.queue.values()].sort(
        (a, b) => a.timestamp - b.timestamp
      );
      context.queue.clear();

      for (const op of operations) {
        if (op.type === "set" && op.value !== undefined) {
          if (op.isRaw && driver.setItemRawSync) {
            driver.setItemRawSync(op.key, op.value, op.options || {});
          } else if (driver.setItemSync) {
            driver.setItemSync(op.key, op.value, op.options || {});
          }
        } else if (op.type === "remove" && driver.removeItemSync) {
          driver.removeItemSync(op.key, op.options || {});
        }
      }
    } finally {
      context.flushing = false;

      if (context.queue.size > 0 && !context.disposed) {
        scheduleFlush();
      }
    }
  };

  const queueOperation = (operation: QueuedOperation) => {
    if (context.disposed) {
      return;
    }

    if (options.mergeUpdates || !context.queue.has(operation.key)) {
      context.queue.set(operation.key, operation);
    }

    if (context.queue.size >= options.batchSize) {
      if (context.flushTimer) {
        clearTimeout(context.flushTimer);
        context.flushTimer = undefined;
      }
      flushQueue();
    } else {
      scheduleFlush();
    }

    if (context.queue.size >= options.maxQueueSize) {
      flushQueue();
    }
  };

  return {
    name: DRIVER_NAME,
    flags: driver.flags,
    getInstance: () => context,

    hasItem(key, opts = {}) {
      const queued = context.queue.get(key);
      if (queued) {
        return queued.type === "set";
      }
      return driver.hasItem(key, opts);
    },

    async getItem(key, opts = {}) {
      const queued = context.queue.get(key);
      if (queued) {
        return queued.type === "set" ? queued.value || null : null;
      }
      return driver.getItem(key, opts);
    },

    async getItems(items, commonOptions = {}) {
      const results = [];
      const nonQueuedItems = [];

      for (const item of items) {
        const key = typeof item === "string" ? item : item.key;

        const queued = context.queue.get(key);
        if (queued) {
          results.push({
            key,
            value: queued.type === "set" ? queued.value || null : null,
          });
        } else {
          nonQueuedItems.push(item);
        }
      }

      if (nonQueuedItems.length > 0) {
        if (driver.getItems) {
          const driverResults = await driver.getItems(
            nonQueuedItems,
            commonOptions
          );
          results.push(...driverResults);
        } else {
          const driverResults = await Promise.all(
            nonQueuedItems.map(async (item) => {
              const key = typeof item === "string" ? item : item.key;
              const options =
                typeof item === "string"
                  ? commonOptions
                  : { ...commonOptions, ...item.options };
              const value = await driver.getItem(key, options);
              return { key, value };
            })
          );
          results.push(...driverResults);
        }
      }

      return results;
    },

    async getItemRaw(key, opts = {}) {
      const queued = context.queue.get(key);
      if (queued) {
        return queued.type === "set" ? queued.value || null : null;
      }
      return driver.getItemRaw
        ? driver.getItemRaw(key, opts)
        : driver.getItem(key, opts);
    },

    setItem(key, value, opts = {}) {
      if (!driver.setItem) {
        return;
      }

      queueOperation({
        type: "set",
        key,
        value,
        options: opts,
        timestamp: Date.now(),
      });
    },

    setItems(items, commonOptions = {}) {
      if (!driver.setItem && !driver.setItems) {
        return;
      }

      for (const item of items) {
        queueOperation({
          type: "set",
          key: item.key,
          value: item.value,
          options: { ...commonOptions, ...item.options },
          timestamp: Date.now(),
        });
      }
    },

    setItemRaw(key, value, opts = {}) {
      if (!driver.setItem && !driver.setItemRaw) {
        return;
      }

      queueOperation({
        type: "set",
        key,
        value,
        options: opts,
        timestamp: Date.now(),
        isRaw: true,
      });
    },

    removeItem(key, opts = {}) {
      if (!driver.removeItem) {
        return;
      }

      queueOperation({
        type: "remove",
        key,
        options: opts,
        timestamp: Date.now(),
      });
    },

    async getMeta(key, opts = {}) {
      return driver.getMeta ? driver.getMeta(key, opts) : null;
    },

    async getKeys(base = "", opts = {}) {
      const driverKeys = await driver.getKeys(base, opts);
      const queuedKeys = [...context.queue.keys()].filter(
        (key) => key.startsWith(base) && context.queue.get(key)?.type === "set"
      );

      const removedKeys = [...context.queue.keys()].filter(
        (key) =>
          key.startsWith(base) && context.queue.get(key)?.type === "remove"
      );

      const allKeys = new Set([...driverKeys, ...queuedKeys]);
      for (const key of removedKeys) {
        allKeys.delete(key);
      }

      return [...allKeys];
    },

    async clear(base = "", opts = {}) {
      if (driver.clear) {
        await flushQueue();
        return driver.clear(base, opts);
      }

      const keys = await driver.getKeys(base, opts);
      await Promise.all(keys.map((key) => driver.removeItem?.(key, opts)));
    },

    async dispose() {
      if (context.flushTimer) {
        clearTimeout(context.flushTimer);
        context.flushTimer = undefined;
      }

      await flushQueue();

      context.disposed = true;

      if (driver.dispose) {
        await driver.dispose();
      }
    },

    watch(callback: WatchCallback): Promise<Unwatch> | Unwatch {
      return driver.watch ? driver.watch(callback) : () => {};
    },

    flush() {
      return flushQueue();
    },

    flushSync() {
      return flushQueueSync();
    },

    // Synchronous methods - flush queue first then call underlying driver
    hasItemSync(key, opts = {}) {
      // For sync operations, check queue first
      const queued = context.queue.get(key);
      if (queued) {
        return queued.type === "set";
      }
      if (!driver.hasItemSync) {
        throw new Error(
          "Underlying driver does not support synchronous hasItem operation"
        );
      }
      return driver.hasItemSync(key, opts);
    },

    getItemSync(key, opts = {}) {
      // For sync operations, check queue first
      const queued = context.queue.get(key);
      if (queued) {
        return queued.type === "set" ? queued.value || null : null;
      }
      if (!driver.getItemSync) {
        throw new Error(
          "Underlying driver does not support synchronous getItem operation"
        );
      }
      return driver.getItemSync(key, opts);
    },

    getItemRawSync(key, opts = {}) {
      // For sync operations, check queue first
      const queued = context.queue.get(key);
      if (queued) {
        return queued.type === "set" ? queued.value || null : null;
      }
      if (!driver.getItemRawSync) {
        throw new Error(
          "Underlying driver does not support synchronous getItemRaw operation"
        );
      }
      return driver.getItemRawSync(key, opts);
    },

    setItemSync(key, value, opts = {}) {
      if (!driver.setItemSync) {
        throw new Error(
          "Underlying driver does not support synchronous setItem operation"
        );
      }
      // For sync operations, bypass queue and write directly
      return driver.setItemSync(key, value, opts);
    },

    setItemRawSync(key, value, opts = {}) {
      if (!driver.setItemRawSync) {
        throw new Error(
          "Underlying driver does not support synchronous setItemRaw operation"
        );
      }
      // For sync operations, bypass queue and write directly
      return driver.setItemRawSync(key, value, opts);
    },

    removeItemSync(key, opts = {}) {
      if (!driver.removeItemSync) {
        throw new Error(
          "Underlying driver does not support synchronous removeItem operation"
        );
      }
      // For sync operations, bypass queue and remove directly
      return driver.removeItemSync(key, opts);
    },

    getMetaSync(key, opts = {}) {
      if (!driver.getMetaSync) {
        throw new Error(
          "Underlying driver does not support synchronous getMeta operation"
        );
      }
      return driver.getMetaSync(key, opts);
    },

    getKeysSync(base = "", opts = {}) {
      if (!driver.getKeysSync) {
        throw new Error(
          "Underlying driver does not support synchronous getKeys operation"
        );
      }
      // For sync operations, we need to account for queued operations
      const driverKeys = driver.getKeysSync(base, opts);
      const queuedKeys = [...context.queue.keys()].filter(
        (key) => key.startsWith(base) && context.queue.get(key)?.type === "set"
      );

      const removedKeys = [...context.queue.keys()].filter(
        (key) =>
          key.startsWith(base) && context.queue.get(key)?.type === "remove"
      );

      const allKeys = new Set([...driverKeys, ...queuedKeys]);
      for (const key of removedKeys) {
        allKeys.delete(key);
      }

      return [...allKeys];
    },

    clearSync(base = "", opts = {}) {
      if (!driver.clearSync) {
        throw new Error(
          "Underlying driver does not support synchronous clear operation"
        );
      }
      // For sync operations, clear any queued items for this base and call underlying driver
      const keysToRemove = [...context.queue.keys()].filter((key) =>
        key.startsWith(base)
      );
      for (const key of keysToRemove) {
        context.queue.delete(key);
      }
      return driver.clearSync(base, opts);
    },
  };
});
