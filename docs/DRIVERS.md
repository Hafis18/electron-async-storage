# Driver Guide

This comprehensive guide covers all aspects of drivers in electron-async-storage, including built-in drivers, custom driver development, and advanced driver patterns.

## Table of Contents

- [Driver Interface Specification](#driver-interface-specification)
- [Built-in Drivers](#built-in-drivers)
- [Driver Development](#driver-development)
- [Advanced Driver Patterns](#advanced-driver-patterns)
- [Performance Considerations](#performance-considerations)
- [Testing Drivers](#testing-drivers)

## Driver Interface Specification

All drivers must implement the `Driver` interface. Understanding this interface is crucial for both using and developing drivers.

### Core Driver Interface

```typescript
interface Driver<OptionsT = any, InstanceT = any> {
  // Metadata
  name?: string; // Driver identifier for debugging
  flags?: DriverFlags; // Capability flags
  options?: OptionsT; // Driver configuration
  getInstance?: () => InstanceT; // Access to driver internals

  // Required Methods
  hasItem(key: string, opts: TransactionOptions): MaybePromise<boolean>;
  getItem(key: string, opts?: TransactionOptions): MaybePromise<StorageValue>;
  getKeys(base: string, opts: GetKeysOptions): MaybePromise<string[]>;

  // Optional Write Methods
  setItem?(
    key: string,
    value: string,
    opts: TransactionOptions
  ): MaybePromise<void>;
  removeItem?(key: string, opts: TransactionOptions): MaybePromise<void>;
  clear?(base: string, opts: TransactionOptions): MaybePromise<void>;

  // Optional Metadata Methods
  getMeta?(
    key: string,
    opts: TransactionOptions
  ): MaybePromise<StorageMeta | null>;

  // Optional Performance Methods
  getItems?(
    items: Array<{ key: string; options?: TransactionOptions }>,
    commonOptions?: TransactionOptions
  ): MaybePromise<Array<{ key: string; value: StorageValue }>>;
  setItems?(
    items: Array<{ key: string; value: string; options?: TransactionOptions }>,
    commonOptions?: TransactionOptions
  ): MaybePromise<void>;

  // Optional Raw Value Methods
  getItemRaw?(key: string, opts: TransactionOptions): MaybePromise<unknown>;
  setItemRaw?(
    key: string,
    value: any,
    opts: TransactionOptions
  ): MaybePromise<void>;

  // Optional Lifecycle Methods
  watch?(callback: WatchCallback): MaybePromise<Unwatch>;
  dispose?(): MaybePromise<void>;

  // Optional Synchronous API Methods
  hasItemSync?(key: string, opts: TransactionOptions): boolean;
  getItemSync?(key: string, opts?: TransactionOptions): StorageValue;
  getKeysSync?(base: string, opts: GetKeysOptions): string[];
  setItemSync?(key: string, value: string, opts: TransactionOptions): void;
  removeItemSync?(key: string, opts: TransactionOptions): void;
  getMetaSync?(key: string, opts: TransactionOptions): StorageMeta | null;
  clearSync?(base: string, opts: TransactionOptions): void;
  getItemsSync?(
    items: Array<{ key: string; options?: TransactionOptions }>,
    commonOptions?: TransactionOptions
  ): Array<{ key: string; value: StorageValue }>;
  setItemsSync?(
    items: Array<{ key: string; value: string; options?: TransactionOptions }>,
    commonOptions?: TransactionOptions
  ): void;
  getItemRawSync?(key: string, opts: TransactionOptions): unknown;
  setItemRawSync?(key: string, value: any, opts: TransactionOptions): void;
}
```

### Driver Flags

Driver flags communicate capabilities to the storage core:

```typescript
interface DriverFlags {
  maxDepth?: boolean; // Supports native depth filtering
  ttl?: boolean; // Supports time-to-live functionality
}
```

### MaybePromise Type

Drivers can implement methods synchronously or asynchronously:

```typescript
type MaybePromise<T> = T | Promise<T>;
```

This flexibility allows for both high-performance synchronous operations (like memory storage) and asynchronous I/O operations (like file system storage).

## Built-in Drivers

### Memory Driver

**Location**: `electron-async-storage/drivers/memory`

The memory driver provides ultra-fast in-memory storage using a JavaScript Map.

#### Features

- ✅ **Full Synchronous API**: Complete sync method support for all operations
- ✅ **Maximum Performance**: All operations complete without Promise overhead
- ✅ **Complete API Support**: Implements all optional methods (async and sync)
- ✅ **Type Safety**: Full TypeScript support with generic typing
- ✅ **Instant Operations**: Zero latency for reads and writes
- ❌ **Persistence**: Data is lost when process exits
- ❌ **Watching**: No change notifications (not applicable for memory)

#### Implementation Details

```typescript
export default defineDriver<void, Map<string, any>>(() => {
  const data = new Map<string, any>();

  return {
    name: "memory",
    getInstance: () => data, // Access to underlying Map

    // Async operations (for compatibility)
    hasItem(key) {
      return data.has(key);
    },
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
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

    // Raw operations (no serialization needed)
    getItemRaw(key) {
      return data.get(key) ?? null;
    },
    setItemRaw(key, value) {
      data.set(key, value);
    },

    // Synchronous API (identical implementation for maximum performance)
    hasItemSync(key) {
      return data.has(key);
    },
    getItemSync(key) {
      return data.get(key) ?? null;
    },
    setItemSync(key, value) {
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
    getItemRawSync(key) {
      return data.get(key) ?? null;
    },
    setItemRawSync(key, value) {
      data.set(key, value);
    },
  };
});
```

#### Usage Examples

```typescript
import memoryDriver from "electron-async-storage/drivers/memory";

// Basic usage
const storage = createStorage({ driver: memoryDriver() });

// Async operations
await storage.setItem("user:profile", { name: "John" });
const profile = await storage.getItem("user:profile");

// Synchronous operations (preferred for memory driver)
storage.setItemSync("config:theme", "dark");
const theme = storage.getItemSync("config:theme");

// Access underlying Map (for debugging/inspection)
const map = storage.getMount().driver.getInstance();
console.log("Memory usage:", map.size);

// Performance comparison
console.time("sync-ops");
for (let i = 0; i < 100000; i++) {
  storage.setItemSync(`key-${i}`, { value: i });
}
console.timeEnd("sync-ops"); // ~50ms for 100k operations

console.time("async-ops");
for (let i = 0; i < 100000; i++) {
  await storage.setItem(`async-key-${i}`, { value: i });
}
console.timeEnd("async-ops"); // ~150ms for 100k operations (Promise overhead)
```

#### Best Practices

- Use for temporary data, caches, and session storage
- Consider memory limits for large datasets
- Ideal for testing and development environments
- Combine with other drivers using mount system

### File System Driver

**Location**: `electron-async-storage/drivers/fs`

The file system driver provides full-featured persistent storage with real-time watching.

#### Configuration Options

```typescript
interface FSStorageOptions {
  base?: string; // Base directory path (required)
  ignore?: string[]; // Ignore patterns (anymatch format)
  readOnly?: boolean; // Read-only mode
  noClear?: boolean; // Disable clear operations
  watchOptions?: ChokidarOptions; // File watcher configuration
}
```

#### Features

- ✅ **Full Synchronous API**: Complete sync method support using Node.js sync fs operations
- ✅ **Persistence**: Data survives process restarts
- ✅ **Real-time Watching**: File system change notifications via chokidar
- ✅ **Metadata Support**: Native file metadata (atime, mtime, size, etc.)
- ✅ **Path Safety**: Protection against directory traversal attacks
- ✅ **Depth Support**: Native maxDepth filtering
- ✅ **Ignore Patterns**: Flexible file exclusion
- ⚠️ **Performance**: Slower than memory due to I/O operations (sync methods available for blocking scenarios)

#### Implementation Highlights

```typescript
export default defineDriver((options: FSStorageOptions = {}) => {
  const base = resolve(options.base);
  const ignore = anymatch(
    options.ignore || ["**/node_modules/**", "**/.git/**"]
  );

  // Path safety
  const resolvePath = (key: string) => {
    if (PATH_TRAVERSE_RE.test(key)) {
      throw createError("fs", `Invalid key: ${JSON.stringify(key)}`);
    }
    return join(base, key.replace(/:/g, "/"));
  };

  return {
    name: "fs",
    flags: { maxDepth: true }, // Native depth support

    async getMeta(key) {
      const { atime, mtime, size, birthtime, ctime } = await fsp
        .stat(resolvePath(key))
        .catch(() => ({}) as Stats);
      return { atime, mtime, size, birthtime, ctime };
    },

    async watch(callback) {
      const watcher = watch(base, {
        ignoreInitial: true,
        ignored: ignore,
        ...options.watchOptions,
      });

      watcher.on("all", (eventName, path) => {
        const relativePath = relative(base, path);
        if (eventName === "change" || eventName === "add") {
          callback("update", relativePath);
        } else if (eventName === "unlink") {
          callback("remove", relativePath);
        }
      });

      return () => watcher.close();
    },
  };
});
```

#### Advanced Usage Examples

```typescript
import fsDriver from "electron-async-storage/drivers/fs";
import { app } from "electron";

// Production configuration
const storage = createStorage({
  driver: fsDriver({
    base: path.join(app.getPath("userData"), "app-storage"),
    ignore: ["**/temp/**", "**/*.tmp", "**/logs/**/*.log"],
    watchOptions: {
      ignored: /(^|[\/\\])\../, // Ignore dotfiles
      persistent: true,
      ignorePermissionErrors: true,
    },
  }),
});

// Watch for configuration changes
const unwatch = await storage.watch((event, key) => {
  if (key.startsWith("config:")) {
    console.log(`Configuration ${event}: ${key}`);
    // Reload configuration
    reloadConfig();
  }
});

// File metadata usage
const meta = await storage.getMeta("app-settings.json");
console.log(`Last modified: ${meta.mtime}`);
console.log(`File size: ${meta.size} bytes`);
```

#### Performance Optimization

```typescript
// Use depth limiting for large directory trees
const shallowKeys = await storage.getKeys("config", { maxDepth: 1 });

// Batch operations for better performance
await storage.setItems([
  { key: "config:theme", value: "dark" },
  { key: "config:lang", value: "en" },
  { key: "config:debug", value: false },
]);
```

### File System Lite Driver

**Location**: `electron-async-storage/drivers/fs-lite`

A lightweight version of the file system driver without watching capabilities.

#### Key Differences from FS Driver

- ❌ **No Watching**: Smaller bundle size, no chokidar dependency
- ✅ **Same API**: Drop-in replacement for fs driver
- ✅ **Better Performance**: Slight performance improvement without watcher overhead
- ✅ **Smaller Memory Footprint**: No file watcher instances

#### Configuration

```typescript
interface FSStorageOptions {
  base?: string;
  ignore?: (path: string) => boolean; // Function-based ignore (not anymatch)
  readOnly?: boolean;
  noClear?: boolean;
}
```

#### Usage

```typescript
import fsLiteDriver from "electron-async-storage/drivers/fs-lite";

// Identical API to fs driver
const storage = createStorage({
  driver: fsLiteDriver({
    base: "./data",
    ignore: (path) => path.includes("temp") || path.endsWith(".tmp"),
  }),
});

// Same operations, no watching
await storage.setItem("config", { theme: "dark" });
const config = await storage.getItem("config");
```

### Queue Driver

**Location**: `electron-async-storage/drivers/queue`

The queue driver is a sophisticated performance wrapper that batches operations for any underlying driver.

#### Configuration Options

```typescript
interface QueueDriverOptions extends QueueOptions {
  driver: Driver; // Wrapped driver (required)
}

interface QueueOptions {
  batchSize?: number; // Operations per batch (default: 100)
  flushInterval?: number; // Auto-flush interval in ms (default: 1000)
  maxQueueSize?: number; // Maximum queue size (default: 1000)
  mergeUpdates?: boolean; // Merge duplicate key updates (default: true)
}
```

#### Architecture

```typescript
interface QueuedOperation {
  type: "set" | "remove";
  key: string;
  value?: any;
  options?: TransactionOptions;
  timestamp: number;
  isRaw?: boolean;
}

interface QueueContext {
  queue: Map<string, QueuedOperation>; // Keyed by storage key
  flushTimer?: NodeJS.Timeout;
  flushing: boolean;
  disposed: boolean;
}
```

#### Key Features

- **Automatic Batching**: Groups operations for efficiency
- **Smart Merging**: Combines duplicate key operations
- **Overflow Protection**: Auto-flush on queue size limits
- **Order Preservation**: Maintains operation chronology
- **Graceful Degradation**: Transparent fallback for unsupported operations

#### Implementation Highlights

```typescript
const flushQueue = async () => {
  if (context.flushing || context.queue.size === 0) return;

  context.flushing = true;
  try {
    // Sort operations by timestamp
    const operations = [...context.queue.values()].sort(
      (a, b) => a.timestamp - b.timestamp
    );

    // Group by operation type
    const setOps = operations.filter(
      (op) => op.type === "set" && op.value !== undefined
    );
    const removeOps = operations.filter((op) => op.type === "remove");

    // Use batch operations if available
    if (
      driver.setItems &&
      setOps.length > 1 &&
      setOps.every((op) => !op.isRaw)
    ) {
      await driver.setItems(
        setOps.map((op) => ({
          key: op.key,
          value: op.value,
          options: op.options,
        }))
      );
    } else {
      // Fallback to individual operations
      await Promise.all(
        setOps.map((op) => {
          return op.isRaw && driver.setItemRaw
            ? driver.setItemRaw(op.key, op.value, op.options || {})
            : driver.setItem?.(op.key, op.value, op.options || {});
        })
      );
    }

    // Handle removals
    await Promise.all(
      removeOps.map((op) => driver.removeItem?.(op.key, op.options || {}))
    );
  } finally {
    context.flushing = false;
  }
};
```

#### Advanced Usage Patterns

```typescript
import queueDriver from "electron-async-storage/drivers/queue";
import fsDriver from "electron-async-storage/drivers/fs";

// High-throughput logging
const loggingStorage = createStorage({
  driver: queueDriver({
    driver: fsDriver({ base: "./logs" }),
    batchSize: 1000,
    flushInterval: 5000,
    mergeUpdates: true, // Latest log entry wins
  }),
});

// Real-time user preferences
const prefsStorage = createStorage({
  driver: queueDriver({
    driver: fsDriver({ base: "./prefs" }),
    batchSize: 10,
    flushInterval: 100, // Quick flush for responsiveness
    mergeUpdates: false, // Preserve all updates
  }),
});

// Performance monitoring
const queueContext = loggingStorage.getMount().driver.getInstance();
console.log("Queue size:", queueContext.queue.size);
console.log("Is flushing:", queueContext.flushing);
```

## Driver Development

### Creating Custom Drivers

Use the `defineDriver` helper for type-safe driver development:

```typescript
import {
  defineDriver,
  createError,
} from "electron-async-storage/drivers/utils";

interface RedisDriverOptions {
  host: string;
  port?: number;
  password?: string;
  db?: number;
}

export default defineDriver<RedisDriverOptions>((options) => {
  const redis = new Redis({
    host: options.host,
    port: options.port || 6379,
    password: options.password,
    db: options.db || 0,
  });

  return {
    name: "redis",
    options,

    async hasItem(key) {
      const result = await redis.exists(key);
      return result === 1;
    },

    async getItem(key) {
      const value = await redis.get(key);
      return value;
    },

    async setItem(key, value, opts) {
      if (opts.ttl) {
        await redis.setex(key, Math.floor(opts.ttl / 1000), value);
      } else {
        await redis.set(key, value);
      }
    },

    async removeItem(key) {
      await redis.del(key);
    },

    async getKeys(base) {
      const pattern = base ? `${base}*` : "*";
      return redis.keys(pattern);
    },

    async clear(base) {
      const keys = await this.getKeys(base);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    },

    async dispose() {
      await redis.quit();
    },
  };
});
```

### Driver Testing Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createStorage } from "electron-async-storage";
import myDriver from "./my-driver";

describe("MyDriver", () => {
  let storage: Storage;

  beforeEach(async () => {
    storage = createStorage({
      driver: myDriver({
        // test configuration
      }),
    });
  });

  afterEach(async () => {
    await storage.clear();
    await storage.dispose();
  });

  it("should store and retrieve items", async () => {
    await storage.setItem("test-key", "test-value");
    expect(await storage.getItem("test-key")).toBe("test-value");
    expect(await storage.hasItem("test-key")).toBe(true);
  });

  it("should handle complex objects", async () => {
    const complexObject = {
      date: new Date(),
      set: new Set([1, 2, 3]),
      map: new Map([["key", "value"]]),
    };

    await storage.setItem("complex", complexObject);
    const retrieved = await storage.getItem("complex");

    expect(retrieved.date).toBeInstanceOf(Date);
    expect(retrieved.set).toBeInstanceOf(Set);
    expect(retrieved.map).toBeInstanceOf(Map);
  });

  it("should support batch operations", async () => {
    await storage.setItems([
      { key: "key1", value: "value1" },
      { key: "key2", value: "value2" },
    ]);

    const results = await storage.getItems(["key1", "key2"]);
    expect(results).toHaveLength(2);
    expect(results[0].value).toBe("value1");
    expect(results[1].value).toBe("value2");
  });
});
```

## Advanced Driver Patterns

### Encryption Driver Wrapper

```typescript
import crypto from "crypto";

interface EncryptionDriverOptions {
  driver: Driver;
  secretKey: string;
  algorithm?: string;
}

export default defineDriver<EncryptionDriverOptions>((options) => {
  const { driver, secretKey, algorithm = "aes-256-gcm" } = options;

  const encrypt = (text: string): string => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(algorithm, secretKey);
    cipher.setAutoPadding(true);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    return iv.toString("hex") + ":" + encrypted;
  };

  const decrypt = (encryptedText: string): string => {
    const [ivHex, encrypted] = encryptedText.split(":");
    const decipher = crypto.createDecipher(algorithm, secretKey);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  };

  return {
    name: "encrypted-" + (driver.name || "unknown"),
    flags: driver.flags,

    async hasItem(key, opts) {
      return driver.hasItem(key, opts);
    },

    async getItem(key, opts) {
      const encrypted = await driver.getItem(key, opts);
      return encrypted ? decrypt(encrypted) : null;
    },

    async setItem(key, value, opts) {
      if (!driver.setItem) return;
      const encrypted = encrypt(value);
      return driver.setItem(key, encrypted, opts);
    },

    // Delegate other methods to wrapped driver
    removeItem: driver.removeItem?.bind(driver),
    getKeys: driver.getKeys.bind(driver),
    clear: driver.clear?.bind(driver),
    dispose: driver.dispose?.bind(driver),
  };
});
```

### Multi-Region Driver

```typescript
interface MultiRegionOptions {
  regions: Record<string, Driver>;
  defaultRegion: string;
  replicationStrategy?: "sync" | "async" | "none";
}

export default defineDriver<MultiRegionOptions>((options) => {
  const { regions, defaultRegion, replicationStrategy = "async" } = options;

  const getRegionForKey = (key: string): string => {
    // Simple hash-based region selection
    const hash = key.split("").reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);

    const regionNames = Object.keys(regions);
    return regionNames[Math.abs(hash) % regionNames.length];
  };

  return {
    name: "multi-region",

    async getItem(key, opts) {
      const region = getRegionForKey(key);
      return regions[region].getItem(key, opts);
    },

    async setItem(key, value, opts) {
      const region = getRegionForKey(key);
      await regions[region].setItem?.(key, value, opts);

      // Replicate to other regions
      if (replicationStrategy === "sync") {
        await Promise.all(
          Object.entries(regions)
            .filter(([name]) => name !== region)
            .map(([, driver]) => driver.setItem?.(key, value, opts))
        );
      } else if (replicationStrategy === "async") {
        Promise.all(
          Object.entries(regions)
            .filter(([name]) => name !== region)
            .map(([, driver]) => driver.setItem?.(key, value, opts))
        ).catch(console.error);
      }
    },
  };
});
```

### Caching Driver

```typescript
interface CacheDriverOptions {
  primary: Driver; // Primary storage
  cache: Driver; // Fast cache layer
  cacheTTL?: number; // Cache TTL in ms
  cachePrefix?: string;
}

export default defineDriver<CacheDriverOptions>((options) => {
  const { primary, cache, cacheTTL = 300000, cachePrefix = "cache:" } = options;

  const getCacheKey = (key: string) => cachePrefix + key;

  return {
    name: "cached-" + (primary.name || "unknown"),

    async getItem(key, opts) {
      // Try cache first
      const cacheKey = getCacheKey(key);
      const cached = await cache.getItem(cacheKey, opts);

      if (cached !== null) {
        return cached;
      }

      // Fallback to primary
      const value = await primary.getItem(key, opts);

      if (value !== null) {
        // Update cache asynchronously
        cache
          .setItem?.(cacheKey, value, { ...opts, ttl: cacheTTL })
          .catch(console.error);
      }

      return value;
    },

    async setItem(key, value, opts) {
      // Update primary
      await primary.setItem?.(key, value, opts);

      // Update cache
      const cacheKey = getCacheKey(key);
      await cache.setItem?.(cacheKey, value, { ...opts, ttl: cacheTTL });
    },

    async removeItem(key, opts) {
      // Remove from both
      await Promise.all([
        primary.removeItem?.(key, opts),
        cache.removeItem?.(getCacheKey(key), opts),
      ]);
    },
  };
});
```

## Performance Considerations

### Driver Performance Characteristics

| Driver  | Read Speed | Write Speed | Memory Usage | Persistence | Watching |
| ------- | ---------- | ----------- | ------------ | ----------- | -------- |
| Memory  | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐  | High         | No          | No       |
| FS      | ⭐⭐⭐     | ⭐⭐        | Low          | Yes         | Yes      |
| FS-Lite | ⭐⭐⭐     | ⭐⭐⭐      | Low          | Yes         | No       |
| Queue   | ⭐⭐⭐⭐   | ⭐⭐⭐⭐⭐  | Medium       | Depends     | Depends  |

### Optimization Strategies

1. **Use Queue Driver**: For high-write workloads
2. **Implement Batch Operations**: Reduce driver calls
3. **Enable Native Depth Support**: Set `maxDepth` flag
4. **Optimize Key Patterns**: Use hierarchical keys efficiently
5. **Monitor Memory Usage**: Especially for memory and queue drivers

### Benchmarking Template

```typescript
import { performance } from "perf_hooks";

async function benchmarkDriver(storage: Storage, operations = 10000) {
  console.log(`Benchmarking ${operations} operations...`);

  // Write benchmark
  const writeStart = performance.now();
  for (let i = 0; i < operations; i++) {
    await storage.setItem(`key-${i}`, { value: i, timestamp: Date.now() });
  }
  const writeTime = performance.now() - writeStart;
  console.log(
    `Write: ${writeTime.toFixed(2)}ms (${((operations / writeTime) * 1000).toFixed(0)} ops/sec)`
  );

  // Read benchmark
  const readStart = performance.now();
  for (let i = 0; i < operations; i++) {
    await storage.getItem(`key-${i}`);
  }
  const readTime = performance.now() - readStart;
  console.log(
    `Read: ${readTime.toFixed(2)}ms (${((operations / readTime) * 1000).toFixed(0)} ops/sec)`
  );

  // Batch read benchmark
  const batchStart = performance.now();
  const keys = Array.from({ length: operations }, (_, i) => `key-${i}`);
  await storage.getItems(keys);
  const batchTime = performance.now() - batchStart;
  console.log(
    `Batch Read: ${batchTime.toFixed(2)}ms (${((operations / batchTime) * 1000).toFixed(0)} ops/sec)`
  );
}
```

This comprehensive guide provides everything needed to understand, use, and extend the driver system in electron-async-storage. The flexibility and power of the driver architecture enables sophisticated storage patterns while maintaining simplicity for common use cases.
