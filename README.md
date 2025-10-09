# electron-async-storage

[![npm version](https://img.shields.io/npm/v/electron-async-storage.svg?style=flat)](https://npmjs.com/package/electron-async-storage)
[![npm downloads](https://img.shields.io/npm/dm/electron-async-storage.svg?style=flat)](https://npmjs.com/package/electron-async-storage)
[![bundle size](https://img.shields.io/bundlephobia/minzip/electron-async-storage?style=flat)](https://bundlephobia.com/package/electron-async-storage)

A high-performance, type-safe asynchronous storage library for Electron applications, built on the unstorage architecture. Features a sophisticated driver-based system with advanced serialization, real-time watching, batching capabilities, full synchronous API support, and a powerful migration framework.

## ✨ Key Features

- **🏗️ Driver-Based Architecture**: Mount multiple storage backends with different drivers
- **⚡ Dual API**: Full synchronous and asynchronous API support for maximum flexibility
- **🚀 High Performance**: Built-in batching, queueing, and optimization strategies
- **📡 Real-time Watching**: File system monitoring with chokidar integration
- **🔄 Migration System**: Version-based migrations with hooks and error handling
- **🏷️ Advanced TypeScript**: Conditional typing, storage definitions, and full type safety
- **📦 Serialization Engine**: Complex object serialization using superjson (Date, RegExp, Set, Map, Error, URL, bigint)
- **🔧 Tree-Shakable**: Modular architecture with individual driver imports
- **⚡ Multiple Formats**: ESM, CJS with optimized builds

## 🚀 Installation

```bash
# Using npm
npm install electron-async-storage

# Using pnpm
pnpm add electron-async-storage

# Using yarn
yarn add electron-async-storage
```

## 📖 Quick Start

### Basic Usage

```typescript
import { createStorage } from "electron-async-storage";

// Create storage with default memory driver
const storage = createStorage();

// Asynchronous operations
await storage.setItem("user:profile", {
  name: "John Doe",
  lastLogin: new Date(),
  preferences: new Set(["dark-mode", "notifications"]),
});

const profile = await storage.getItem("user:profile");
console.log(profile); // Full object with Date and Set preserved

// Synchronous operations (great for configuration and caching)
storage.setItemSync("config:theme", "dark");
storage.setItemSync("config:language", "en");

const theme = storage.getItemSync("config:theme");
const allConfigs = storage.getKeysSync("config:");
console.log(theme); // "dark"
console.log(allConfigs); // ["config:theme", "config:language"]
```

### File System Storage

```typescript
import { createStorage } from "electron-async-storage";
import fsDriver from "electron-async-storage/drivers/fs";
import { app } from "electron";

const storage = createStorage({
  driver: fsDriver({
    base: path.join(app.getPath("userData"), "storage"),
  }),
});

// All data persisted to disk with real-time watching
await storage.setItem("app:settings", { theme: "dark", version: "1.0.0" });
```

### Multi-Driver Architecture

```typescript
import { createStorage } from "electron-async-storage";
import fsDriver from "electron-async-storage/drivers/fs";
import memoryDriver from "electron-async-storage/drivers/memory";
import queueDriver from "electron-async-storage/drivers/queue";

const storage = createStorage({ driver: memoryDriver() });

// Mount different drivers for different data types
storage.mount("cache", memoryDriver()); // Fast in-memory cache
storage.mount("config", fsDriver({ base: "./config" })); // Persistent config
storage.mount(
  "logs",
  queueDriver({
    driver: fsDriver({ base: "./logs" }),
    batchSize: 100,
    flushInterval: 5000,
  })
); // Batched logging

// Data automatically routed to appropriate driver
await storage.setItem("cache:user-session", sessionData); // → Memory
await storage.setItem("config:app-settings", settings); // → File system
await storage.setItem("logs:error", errorData); // → Queued to disk
```

## 🏗️ Core Architecture

### Storage Interface

The `Storage` interface provides a comprehensive dual API for data operations:

```typescript
interface Storage<T extends StorageValue = StorageValue> {
  // Asynchronous Core Operations
  hasItem(key: string, opts?: TransactionOptions): Promise<boolean>;
  getItem<R = T>(key: string, opts?: TransactionOptions): Promise<R | null>;
  setItem(key: string, value: T, opts?: TransactionOptions): Promise<void>;
  removeItem(key: string, opts?: TransactionOptions): Promise<void>;

  // Synchronous Core Operations
  hasItemSync(key: string, opts?: TransactionOptions): boolean;
  getItemSync<R = T>(key: string, opts?: TransactionOptions): R | null;
  setItemSync(key: string, value: T, opts?: TransactionOptions): void;
  removeItemSync(key: string, opts?: TransactionOptions): void;

  // Batch Operations (Async)
  getItems(
    items: string[],
    commonOptions?: TransactionOptions
  ): Promise<Array<{ key: string; value: T | null }>>;
  setItems(
    items: Array<{ key: string; value: T; options?: TransactionOptions }>,
    commonOptions?: TransactionOptions
  ): Promise<void>;

  // Batch Operations (Sync)
  getItemsSync(
    items: string[],
    commonOptions?: TransactionOptions
  ): Array<{ key: string; value: T | null }>;
  setItemsSync(
    items: Array<{ key: string; value: T; options?: TransactionOptions }>,
    commonOptions?: TransactionOptions
  ): void;

  // Raw Value Operations (Async)
  getItemRaw<T = any>(
    key: string,
    opts?: TransactionOptions
  ): Promise<T | null>;
  setItemRaw<T = any>(
    key: string,
    value: T,
    opts?: TransactionOptions
  ): Promise<void>;

  // Raw Value Operations (Sync)
  getItemRawSync<T = any>(key: string, opts?: TransactionOptions): T | null;
  setItemRawSync<T = any>(
    key: string,
    value: T,
    opts?: TransactionOptions
  ): void;

  // Key Management (Async)
  getKeys(base?: string, opts?: GetKeysOptions): Promise<string[]>;
  clear(base?: string, opts?: TransactionOptions): Promise<void>;

  // Key Management (Sync)
  getKeysSync(base?: string, opts?: GetKeysOptions): string[];
  clearSync(base?: string, opts?: TransactionOptions): void;

  // Mount System, Watching, Migration, Lifecycle (Async only)
  mount(base: string, driver: Driver): Storage;
  unmount(base: string, dispose?: boolean): Promise<void>;
  watch(callback: WatchCallback): Promise<Unwatch>;
  migrate(): Promise<void>;
  dispose(): Promise<void>;
  flush(base?: string): Promise<void>; // Manually flush queued operations

  // Aliases (Async)
  keys: typeof getKeys;
  get: typeof getItem;
  set: typeof setItem;
  has: typeof hasItem;
  del: typeof removeItem;
  remove: typeof removeItem;

  // Aliases (Sync)
  keysSync: typeof getKeysSync;
  getSync: typeof getItemSync;
  setSync: typeof setItemSync;
  hasSync: typeof hasItemSync;
  delSync: typeof removeItemSync;
  removeSync: typeof removeItemSync;
  flushSync(base?: string): void; // Synchronously flush queued operations
}
```

### Driver System

All drivers implement the `Driver` interface with optional capabilities:

```typescript
interface Driver<OptionsT = any, InstanceT = any> {
  name?: string;
  flags?: DriverFlags; // { maxDepth?: boolean; ttl?: boolean }
  options?: OptionsT;
  getInstance?: () => InstanceT;

  // Required Methods
  hasItem(key: string, opts: TransactionOptions): MaybePromise<boolean>;
  getItem(key: string, opts?: TransactionOptions): MaybePromise<StorageValue>;
  getKeys(base: string, opts: GetKeysOptions): MaybePromise<string[]>;

  // Optional Methods
  setItem?(
    key: string,
    value: string,
    opts: TransactionOptions
  ): MaybePromise<void>;
  removeItem?(key: string, opts: TransactionOptions): MaybePromise<void>;
  getMeta?(
    key: string,
    opts: TransactionOptions
  ): MaybePromise<StorageMeta | null>;
  clear?(base: string, opts: TransactionOptions): MaybePromise<void>;
  watch?(callback: WatchCallback): MaybePromise<Unwatch>;
  dispose?(): MaybePromise<void>;

  // Batch Operations (Performance Optimization)
  getItems?(
    items: Array<{ key: string; options?: TransactionOptions }>,
    commonOptions?: TransactionOptions
  ): MaybePromise<Array<{ key: string; value: StorageValue }>>;
  setItems?(
    items: Array<{ key: string; value: string; options?: TransactionOptions }>,
    commonOptions?: TransactionOptions
  ): MaybePromise<void>;

  // Raw Value Support
  getItemRaw?(key: string, opts: TransactionOptions): MaybePromise<unknown>;
  setItemRaw?(
    key: string,
    value: any,
    opts: TransactionOptions
  ): MaybePromise<void>;
}
```

## 🔧 Built-in Drivers

### Memory Driver

High-performance in-memory storage using JavaScript Map:

```typescript
import memoryDriver from "electron-async-storage/drivers/memory";

const storage = createStorage({
  driver: memoryDriver(),
});

// Instant read/write operations
// Data lost on process restart
// Perfect for caching and temporary data
```

### File System Driver

Full-featured file system storage with watching capabilities:

```typescript
import fsDriver from "electron-async-storage/drivers/fs";

const storage = createStorage({
  driver: fsDriver({
    base: "./data", // Base directory
    ignore: ["**/node_modules/**"], // Ignore patterns (anymatch)
    readOnly: false, // Read-only mode
    noClear: false, // Disable clear operations
    watchOptions: {
      // Chokidar options
      ignoreInitial: true,
      persistent: true,
    },
  }),
});

// Features:
// - Real-time file watching with chokidar
// - Path traversal protection
// - Recursive directory operations
// - File metadata (atime, mtime, size, birthtime, ctime)
// - Configurable ignore patterns
```

### File System Lite Driver

Lightweight file system storage without watching:

```typescript
import fsLiteDriver from "electron-async-storage/drivers/fs-lite";

const storage = createStorage({
  driver: fsLiteDriver({
    base: "./data",
    ignore: (path) => path.includes("temp"),
    readOnly: false,
    noClear: false,
  }),
});

// Smaller footprint, no chokidar dependency
// Same file operations as fs driver
// No real-time watching capability
```

### Queue Driver

Performance-optimized batching wrapper for any driver:

```typescript
import queueDriver from "electron-async-storage/drivers/queue";
import fsDriver from "electron-async-storage/drivers/fs";

const storage = createStorage({
  driver: queueDriver({
    driver: fsDriver({ base: "./logs" }),
    batchSize: 100, // Batch operations
    flushInterval: 1000, // Auto-flush interval (ms)
    maxQueueSize: 1000, // Maximum queue size
    mergeUpdates: true, // Merge duplicate key updates
  }),
});

// Benefits:
// - Dramatically improved write performance
// - Automatic batching and merging
// - Configurable flush strategies
// - Queue overflow protection
// - Maintains operation order
```

## 📊 Advanced Features

### Complex Object Serialization

electron-async-storage uses superjson for sophisticated object serialization:

```typescript
// All these types are preserved across storage operations
await storage.setItem("complex-data", {
  date: new Date(),
  regex: /pattern/gi,
  set: new Set([1, 2, 3]),
  map: new Map([["key", "value"]]),
  bigint: 123n,
  undefined: undefined,
  error: new Error("test"),
  url: new URL("https://example.com"),
});

const data = await storage.getItem("complex-data");
console.log(data.date instanceof Date); // true
console.log(data.regex instanceof RegExp); // true
console.log(data.set instanceof Set); // true
// All types perfectly preserved
```

### Raw Value Operations

For binary data and custom serialization:

```typescript
// Store raw binary data
const buffer = new Uint8Array([1, 2, 3, 4]);
await storage.setItemRaw("binary-data", buffer);

// Data is base64 encoded automatically
const restored = await storage.getItemRaw("binary-data");
console.log(restored instanceof Uint8Array); // true
```

### Real-Time Watching

Monitor storage changes in real-time:

```typescript
// Watch for all changes
const unwatch = await storage.watch((event, key) => {
  console.log(`${event}: ${key}`); // "update: user:profile"
});

// Watch specific keys
await storage.setItem("user:profile", userData); // Triggers watcher

// Cleanup
await unwatch();
```

### Key Management and Filtering

Sophisticated key operations with depth control:

```typescript
// Hierarchical keys with depth filtering
await storage.setItem("app:ui:theme", "dark");
await storage.setItem("app:ui:layout:sidebar", "collapsed");
await storage.setItem("app:data:cache:user", userData);

// Get keys at specific depths
const uiKeys = await storage.getKeys("app:ui", { maxDepth: 1 });
// Returns: ['app:ui:theme'] (excludes deeper nested keys)

const allAppKeys = await storage.getKeys("app");
// Returns: ['app:ui:theme', 'app:ui:layout:sidebar', 'app:data:cache:user']
```

### Metadata System

Rich metadata support for advanced use cases:

```typescript
// Set metadata
await storage.setMeta("cached-data", {
  ttl: Date.now() + 3_600_000, // TTL timestamp
  source: "api-v2",
  version: "1.2.0",
  priority: "high",
});

// Retrieve with metadata
const meta = await storage.getMeta("cached-data");
console.log(meta.ttl, meta.source, meta.atime, meta.mtime);

// File system drivers include native metadata
const fileMeta = await storage.getMeta("config.json");
console.log(fileMeta.size, fileMeta.birthtime, fileMeta.ctime);
```

## ⚡ Synchronous API

The library provides a complete synchronous API alongside the asynchronous methods, offering zero Promise overhead for performance-critical scenarios and simpler code when blocking operations are acceptable.

### Core Benefits

- **🚀 Zero Promise Overhead**: Direct return values without async/await
- **📝 Simplified Code**: Cleaner logic for configuration and simple operations
- **🎯 Better Performance**: Faster execution for memory and simple file operations
- **🔄 Seamless Integration**: Works alongside async methods in the same storage instance

### Usage Examples

```typescript
import { createStorage } from "electron-async-storage";
import memoryDriver from "electron-async-storage/drivers/memory";

const storage = createStorage({ driver: memoryDriver() });

// Configuration at startup (synchronous)
storage.setItemSync("app:theme", "dark");
storage.setItemSync("app:language", "en");
storage.setItemSync("app:debug", true);

// Quick cache operations
const theme = storage.getItemSync("app:theme");
if (storage.hasItemSync("cache:user-preferences")) {
  const prefs = storage.getItemSync("cache:user-preferences");
  console.log("Cached preferences:", prefs);
}

// Batch operations
storage.setItemsSync([
  { key: "config:api-url", value: "https://api.example.com" },
  { key: "config:timeout", value: 5000 },
  { key: "config:retries", value: 3 },
]);

const allConfigs = storage.getItemsSync([
  "config:api-url",
  "config:timeout",
  "config:retries",
]);

// Key management
const configKeys = storage.getKeysSync("config:");
storage.clearSync("temp:"); // Clear temporary data
```

### Driver Support

| Driver  | Sync Support | Performance | Use Cases                      |
| ------- | ------------ | ----------- | ------------------------------ |
| Memory  | ✅ Full      | Excellent   | Caches, sessions, config       |
| FS      | ✅ Full      | Good        | Persistent config, small files |
| FS-Lite | ✅ Full      | Good        | Lightweight file operations    |
| Queue   | ⚠️ Partial   | Variable    | Immediate operations only      |

### Performance Comparison

```typescript
// Memory driver performance test
console.time("sync-operations");
for (let i = 0; i < 10_000; i++) {
  storage.setItemSync(`key-${i}`, { data: i });
  storage.getItemSync(`key-${i}`);
}
console.timeEnd("sync-operations"); // ~25ms

console.time("async-operations");
for (let i = 0; i < 10_000; i++) {
  await storage.setItem(`async-key-${i}`, { data: i });
  await storage.getItem(`async-key-${i}`);
}
console.timeEnd("async-operations"); // ~75ms (Promise overhead)
```

### Best Practices

- **Use sync methods for**: Configuration loading, simple caches, startup data
- **Use async methods for**: I/O intensive operations, large datasets, non-blocking scenarios
- **Mixed usage**: Combine both APIs as needed in the same application

```typescript
// Application startup: sync for immediate needs
const theme = storage.getItemSync("app:theme") || "light";
const language = storage.getItemSync("app:language") || "en";

// Runtime: async for user data
const userProfile = await storage.getItem("user:profile");
const userSettings = await storage.getItem("user:settings");

// Caching: sync for quick access
if (!storage.hasItemSync("cache:theme-config")) {
  storage.setItemSync("cache:theme-config", buildThemeConfig(theme));
}
```

## 🔄 Migration System

Powerful version-based migration system with hooks:

```typescript
const storage = createStorage({
  driver: fsDriver({ base: "./data" }),
  version: 3,
  migrations: {
    1: async (storage) => {
      // Migrate to version 1
      const oldData = await storage.getItem("legacy-format");
      await storage.setItem("new-format", transformData(oldData));
      await storage.removeItem("legacy-format");
    },
    2: async (storage) => {
      // Migrate to version 2
      const users = await storage.getKeys("users:");
      for (const key of users) {
        const user = await storage.getItem(key);
        user.version = 2;
        user.migrationDate = new Date();
        await storage.setItem(key, user);
      }
    },
    3: async (storage) => {
      // Migrate to version 3
      await storage.setItem("schema-version", {
        version: 3,
        features: ["new-api"],
      });
    },
  },
  migrationHooks: {
    beforeMigration: async (from, to, storage) => {
      console.log(`Starting migration from v${from} to v${to}`);
      await storage.setItem("migration:backup", await snapshot(storage, ""));
    },
    afterMigration: async (from, to, storage) => {
      console.log(`Migration complete: v${from} → v${to}`);
      await storage.removeItem("migration:backup");
    },
    onMigrationError: async (error, from, to, storage) => {
      console.error(`Migration failed: v${from} → v${to}`, error);
      // Restore from backup
      const backup = await storage.getItem("migration:backup");
      await restoreSnapshot(storage, backup);
    },
  },
});

// Migrations run automatically
await storage.migrate();
```

## 🏷️ Advanced TypeScript

### Storage Definitions

Define typed storage schemas for compile-time safety:

```typescript
interface AppStorageSchema {
  items: {
    "user:profile": UserProfile;
    "app:settings": AppSettings;
    "cache:api-response": ApiResponse;
  };
}

const storage = createStorage<AppStorageSchema>();

// Full type safety
await storage.setItem("user:profile", userProfile); // ✅ Typed
await storage.setItem("user:unknown", data); // ❌ Type error

const profile = await storage.getItem("user:profile"); // UserProfile | null
```

### Conditional Types

The library uses sophisticated conditional types for flexible APIs:

```typescript
// Automatically infer return types based on storage definition
type ProfileType = Awaited<ReturnType<typeof storage.getItem<"user:profile">>>;
// ProfileType = UserProfile | null

// Batch operations maintain type safety
const results = await storage.getItems(["user:profile", "app:settings"]);
// results[0].value is UserProfile | null
// results[1].value is AppSettings | null
```

### Driver Type Safety

Custom drivers with full type safety:

```typescript
interface CustomDriverOptions {
  endpoint: string;
  apiKey: string;
  timeout?: number;
}

const customDriver = defineDriver<CustomDriverOptions>((opts) => ({
  name: "custom-api",
  async getItem(key) {
    const response = await fetch(`${opts.endpoint}/${key}`, {
      headers: { Authorization: `Bearer ${opts.apiKey}` },
    });
    return response.json();
  },
  async setItem(key, value) {
    await fetch(`${opts.endpoint}/${key}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify(value),
    });
  },
  // ... other methods
}));
```

## ⚡ Performance Optimization

### Batching Operations

Optimize performance with batch operations:

```typescript
// Instead of individual operations
for (const [key, value] of entries) {
  await storage.setItem(key, value); // Slow: N disk operations
}

// Use batch operations
await storage.setItems(entries.map(([key, value]) => ({ key, value }))); // Fast: 1 batch operation
```

### Queue Driver Configuration

Optimize queue driver for your use case:

```typescript
// High-throughput logging
const loggingStorage = createStorage({
  driver: queueDriver({
    driver: fsDriver({ base: "./logs" }),
    batchSize: 1000, // Large batches for efficiency
    flushInterval: 5000, // Less frequent flushes
    maxQueueSize: 10_000, // Large queue
    mergeUpdates: true, // Merge duplicate updates
  }),
});

// Real-time configuration
const configStorage = createStorage({
  driver: queueDriver({
    driver: fsDriver({ base: "./config" }),
    batchSize: 10, // Small batches for responsiveness
    flushInterval: 100, // Frequent flushes
    maxQueueSize: 100, // Small queue
    mergeUpdates: false, // Preserve all updates
  }),
});
```

### Memory Management

```typescript
// Dispose resources properly
const storage = createStorage({ driver: fsDriver({ base: "./data" }) });

// Use storage...

// Cleanup
await storage.dispose(); // Closes file watchers, flushes queues, etc.
```

## 🔧 Build Integration

### Bundler Configuration

#### Webpack

```javascript
module.exports = {
  resolve: {
    alias: {
      "electron-async-storage/drivers/fs": path.resolve(
        __dirname,
        "node_modules/electron-async-storage/drivers/fs.mjs"
      ),
    },
  },
};
```

#### Vite

```javascript
export default defineConfig({
  resolve: {
    alias: {
      "electron-async-storage/drivers/fs":
        "electron-async-storage/drivers/fs.mjs",
    },
  },
});
```

### Tree Shaking

Import only the drivers you need:

```typescript
// ✅ Tree-shakable - only imports used drivers
import { createStorage } from "electron-async-storage";
import fsDriver from "electron-async-storage/drivers/fs";

// ❌ Imports all drivers
import { createStorage, builtinDrivers } from "electron-async-storage";
```

## 📚 Additional Documentation

- [**Architecture Guide**](./docs/ARCHITECTURE.md) - Deep dive into the internal architecture
- [**Driver Development**](./docs/DRIVERS.md) - Creating custom drivers
- [**Migration Guide**](./docs/MIGRATION.md) - Advanced migration patterns
- [**API Reference**](./docs/API.md) - Complete API documentation
- [**Performance Guide**](./docs/PERFORMANCE.md) - Optimization strategies
- [**TypeScript Guide**](./docs/TYPESCRIPT.md) - Advanced TypeScript usage

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🙏 Acknowledgments

Built on the solid foundation of [unstorage](https://github.com/unjs/unstorage) by the UnJS team.
