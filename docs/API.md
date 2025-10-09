# API Reference

This comprehensive API reference covers all methods, interfaces, and types available in electron-async-storage.

## Table of Contents

- [Storage API](#storage-api)
  - [Core Operations](#core-operations)
  - [Batch Operations](#batch-operations)
  - [Raw Value Operations](#raw-value-operations)
  - [Metadata Operations](#metadata-operations)
  - [Key Management](#key-management)
  - [Mount System](#mount-system)
  - [Watching](#watching)
  - [Migration](#migration)
  - [Lifecycle](#lifecycle)
  - [Synchronous API](#synchronous-api)
  - [Aliases](#aliases)
- [Driver API](#driver-api)
- [Utility Functions](#utility-functions)
- [Type Definitions](#type-definitions)
- [Error Types](#error-types)
- [Configuration Options](#configuration-options)

## Storage API

### createStorage

Creates a new storage instance with the specified configuration.

```typescript
function createStorage<T extends StorageValue>(
  options?: CreateStorageOptions<T>
): Storage<T>;

interface CreateStorageOptions<T extends StorageValue = StorageValue> {
  driver?: Driver; // Storage driver (default: memory)
  version?: number; // Schema version for migrations
  migrations?: MigrationOptions<T>; // Migration functions
  migrationHooks?: MigrationHooks<T>; // Migration hooks
}
```

**Example:**

```typescript
import { createStorage } from "electron-async-storage";
import fsDriver from "electron-async-storage/drivers/fs";

const storage = createStorage({
  driver: fsDriver({ base: "./data" }),
  version: 2,
  migrations: {
    1: async (storage) => {
      /* migration logic */
    },
    2: async (storage) => {
      /* migration logic */
    },
  },
});
```

### Storage Interface

#### Core Operations

##### hasItem

Checks if an item exists in storage.

```typescript
hasItem(key: string, opts?: TransactionOptions): Promise<boolean>
```

**Parameters:**

- `key`: Storage key to check
- `opts`: Optional transaction options

**Returns:** Promise resolving to boolean indicating existence

**Example:**

```typescript
const exists = await storage.hasItem("user:profile");
if (exists) {
  console.log("User profile found");
}
```

##### getItem

Retrieves an item from storage.

```typescript
getItem<R = T>(key: string, opts?: TransactionOptions): Promise<R | null>
```

**Parameters:**

- `key`: Storage key to retrieve
- `opts`: Optional transaction options

**Returns:** Promise resolving to the stored value or null

**Example:**

```typescript
const userProfile = await storage.getItem<UserProfile>("user:profile");
if (userProfile) {
  console.log(`Welcome ${userProfile.name}`);
}
```

##### setItem

Stores an item in storage.

```typescript
setItem(key: string, value: T, opts?: TransactionOptions): Promise<void>
```

**Parameters:**

- `key`: Storage key
- `value`: Value to store
- `opts`: Optional transaction options

**Example:**

```typescript
await storage.setItem("user:profile", {
  name: "John Doe",
  email: "john@example.com",
  lastLogin: new Date(),
});
```

##### removeItem

Removes an item from storage.

```typescript
removeItem(
  key: string,
  opts?: TransactionOptions & { removeMeta?: boolean } | boolean
): Promise<void>
```

**Parameters:**

- `key`: Storage key to remove
- `opts`: Transaction options or legacy boolean for removeMeta

**Example:**

```typescript
// Remove item only
await storage.removeItem("user:session");

// Remove item and its metadata
await storage.removeItem("user:session", { removeMeta: true });
```

#### Batch Operations

##### getItems

Retrieves multiple items in a single operation.

```typescript
getItems(
  items: (string | { key: string; options?: TransactionOptions })[],
  commonOptions?: TransactionOptions
): Promise<Array<{ key: string; value: T | null }>>
```

**Example:**

```typescript
const results = await storage.getItems([
  "user:profile",
  "user:settings",
  { key: "user:preferences", options: { timeout: 5000 } },
]);

for (const { key, value } of results) {
  console.log(`${key}:`, value);
}
```

##### setItems

Stores multiple items in a single operation.

```typescript
setItems(
  items: Array<{
    key: string
    value: T
    options?: TransactionOptions
  }>,
  commonOptions?: TransactionOptions
): Promise<void>
```

**Example:**

```typescript
await storage.setItems([
  { key: "config:theme", value: "dark" },
  { key: "config:language", value: "en" },
  { key: "config:notifications", value: true },
]);
```

#### Raw Value Operations

##### getItemRaw

Retrieves raw value without deserialization.

```typescript
getItemRaw<T = any>(key: string, opts?: TransactionOptions): Promise<T | null>
```

**Example:**

```typescript
// Store binary data
const buffer = new Uint8Array([1, 2, 3, 4]);
await storage.setItemRaw("binary-data", buffer);

// Retrieve binary data
const retrieved = await storage.getItemRaw<Uint8Array>("binary-data");
console.log(retrieved instanceof Uint8Array); // true
```

##### setItemRaw

Stores raw value without serialization.

```typescript
setItemRaw<T = any>(
  key: string,
  value: T,
  opts?: TransactionOptions
): Promise<void>
```

#### Metadata Operations

##### getMeta

Retrieves metadata for a storage key.

```typescript
getMeta(
  key: string,
  opts?: TransactionOptions & { nativeOnly?: boolean } | boolean
): Promise<StorageMeta>
```

**Example:**

```typescript
const meta = await storage.getMeta("user:profile");
console.log("Last modified:", meta.mtime);
console.log("File size:", meta.size);
console.log("Custom metadata:", meta.version);
```

##### setMeta

Sets metadata for a storage key.

```typescript
setMeta(
  key: string,
  value: StorageMeta,
  opts?: TransactionOptions
): Promise<void>
```

**Example:**

```typescript
await storage.setMeta("cached-data", {
  ttl: Date.now() + 3_600_000,
  source: "api-v2",
  priority: "high",
});
```

##### removeMeta

Removes metadata for a storage key.

```typescript
removeMeta(key: string, opts?: TransactionOptions): Promise<void>
```

#### Key Management

##### getKeys

Retrieves all keys matching the specified base pattern.

```typescript
getKeys(base?: string, opts?: GetKeysOptions): Promise<string[]>

interface GetKeysOptions extends TransactionOptions {
  maxDepth?: number  // Maximum key depth to return
}
```

**Example:**

```typescript
// Get all user keys
const userKeys = await storage.getKeys("user:");
console.log("Users:", userKeys); // ['user:profile', 'user:settings', ...]

// Get keys at specific depth
const topLevelConfig = await storage.getKeys("config:", { maxDepth: 1 });
console.log("Config sections:", topLevelConfig); // ['config:ui', 'config:app']
```

##### clear

Removes all items matching the base pattern.

```typescript
clear(base?: string, opts?: TransactionOptions): Promise<void>
```

**Example:**

```typescript
// Clear all cache entries
await storage.clear("cache:");

// Clear everything
await storage.clear();
```

#### Mount System

##### mount

Mounts a driver at the specified base path.

```typescript
mount(base: string, driver: Driver): Storage
```

**Example:**

```typescript
import fsDriver from "electron-async-storage/drivers/fs";
import memoryDriver from "electron-async-storage/drivers/memory";

const storage = createStorage();

// Mount file system driver for configuration
storage.mount("config", fsDriver({ base: "./config" }));

// Mount memory driver for cache
storage.mount("cache", memoryDriver());

// Operations are automatically routed
await storage.setItem("config:app-settings", settings); // → File system
await storage.setItem("cache:user-session", session); // → Memory
```

##### unmount

Unmounts a driver from the specified base path.

```typescript
unmount(base: string, dispose?: boolean): Promise<void>
```

**Example:**

```typescript
// Unmount and dispose driver
await storage.unmount("cache", true);

// Unmount without disposing (driver can be reused)
await storage.unmount("config", false);
```

##### getMount

Gets information about the mount point for a key.

```typescript
getMount(key?: string): { base: string; driver: Driver }
```

**Example:**

```typescript
const mount = storage.getMount("config:app-settings");
console.log("Base path:", mount.base); // 'config:'
console.log("Driver name:", mount.driver.name); // 'fs'
```

##### getMounts

Gets all mount points matching the base pattern.

```typescript
getMounts(
  base?: string,
  options?: { parents?: boolean }
): Array<{ base: string; driver: Driver }>
```

**Example:**

```typescript
// Get all mounts
const allMounts = storage.getMounts();

// Get mounts for specific base
const configMounts = storage.getMounts("config:", { parents: true });
```

#### Watching

##### watch

Sets up real-time monitoring for storage changes.

```typescript
watch(callback: WatchCallback): Promise<Unwatch>

type WatchCallback = (event: WatchEvent, key: string) => any
type WatchEvent = "update" | "remove"
type Unwatch = () => Promise<void>
```

**Example:**

```typescript
const unwatch = await storage.watch((event, key) => {
  console.log(`Storage ${event}: ${key}`);

  if (key.startsWith("config:")) {
    // Reload configuration
    reloadConfig();
  }
});

// Stop watching
await unwatch();
```

##### unwatch

Stops all watching activity.

```typescript
unwatch(): Promise<void>
```

#### Migration

##### migrate

Runs pending migrations.

```typescript
migrate(): Promise<void>
```

**Example:**

```typescript
// Check if migration is needed
const currentVersion = await storage.getStorageVersion();
if (currentVersion < 3) {
  console.log("Running migrations...");
  await storage.migrate();
  console.log("Migrations completed");
}
```

##### getStorageVersion

Gets the current storage version.

```typescript
getStorageVersion(): Promise<number | null>
```

#### Lifecycle

##### dispose

Cleans up resources and closes connections.

```typescript
dispose(): Promise<void>
```

**Example:**

```typescript
// Cleanup before app exit
process.on("beforeExit", async () => {
  await storage.dispose();
});
```

##### flush

Manually flushes queued operations to the underlying storage.

```typescript
flush(base?: string): Promise<void>
```

**Parameters:**

- `base`: Optional mount base path to flush only a specific mount point

**Description:**

The `flush()` method is primarily used with the queue driver to force immediate persistence of queued operations. For drivers that don't support flushing (like memory or fs drivers), this method is a no-op.

**Common Use Cases:**

- Before critical operations that require data consistency
- Before application shutdown to ensure all pending writes are persisted
- After batch operations when immediate persistence is needed
- In test scenarios to ensure deterministic state

**Example:**

```typescript
import queueDriver from "electron-async-storage/drivers/queue";
import fsDriver from "electron-async-storage/drivers/fs";

const storage = createStorage({
  driver: queueDriver({
    driver: fsDriver({ base: "./data" }),
    flushInterval: 5000,
  }),
});

// Queue multiple operations
await storage.setItem("key1", "value1");
await storage.setItem("key2", "value2");
await storage.setItem("key3", "value3");

// Operations are queued, not yet persisted

// Manually flush to ensure immediate persistence
await storage.flush();
// Now all operations are written to disk

// Flush only a specific mount point
storage.mount("logs", queueDriver({ driver: fsDriver({ base: "./logs" }) }));
await storage.setItem("logs:error", errorData);
await storage.flush("logs"); // Only flush the logs mount
```

**Before App Exit:**

```typescript
// Ensure all queued operations are persisted before exit
process.on("beforeExit", async () => {
  await storage.flush();
  await storage.dispose();
});
```

### Synchronous API

The library provides synchronous counterparts to all async operations for scenarios where blocking operations are preferred or needed. Synchronous methods offer better performance for simple operations and eliminate Promise overhead.

#### Core Sync Operations

##### hasItemSync

Synchronously checks if an item exists in storage.

```typescript
hasItemSync(key: string, opts?: TransactionOptions): boolean
```

**Example:**

```typescript
// Check if user profile exists synchronously
const exists = storage.hasItemSync("user:profile");
if (exists) {
  console.log("User profile found");
}
```

##### getItemSync

Synchronously retrieves an item from storage.

```typescript
getItemSync<R = T>(key: string, opts?: TransactionOptions): R | null
```

**Example:**

```typescript
const userProfile = storage.getItemSync<UserProfile>("user:profile");
if (userProfile) {
  console.log(`Welcome ${userProfile.name}`);
}

// Works with complex objects
const settings = storage.getItemSync("app:settings");
console.log("Theme:", settings.theme);
```

##### setItemSync

Synchronously stores an item in storage.

```typescript
setItemSync(key: string, value: T, opts?: TransactionOptions): void
```

**Example:**

```typescript
// Store user preferences
storage.setItemSync("user:preferences", {
  theme: "dark",
  language: "en",
  notifications: true,
});

// Store complex objects with dates
storage.setItemSync("session:data", {
  userId: 123,
  loginTime: new Date(),
  permissions: ["read", "write"],
});
```

##### removeItemSync

Synchronously removes an item from storage.

```typescript
removeItemSync(
  key: string,
  opts?: TransactionOptions & { removeMeta?: boolean } | boolean
): void
```

**Example:**

```typescript
// Remove session data
storage.removeItemSync("session:token");

// Remove with metadata
storage.removeItemSync("cache:data", { removeMeta: true });
```

#### Sync Batch Operations

##### getItemsSync

Synchronously retrieves multiple items.

```typescript
getItemsSync(
  items: (string | { key: string; options?: TransactionOptions })[],
  commonOptions?: TransactionOptions
): Array<{ key: string; value: T | null }>
```

**Example:**

```typescript
const configs = storage.getItemsSync([
  "config:theme",
  "config:language",
  { key: "config:advanced", options: { timeout: 1000 } },
]);

for (const { key, value } of configs) {
  console.log(`${key}:`, value);
}
```

##### setItemsSync

Synchronously stores multiple items.

```typescript
setItemsSync(
  items: Array<{
    key: string
    value: T
    options?: TransactionOptions
  }>,
  commonOptions?: TransactionOptions
): void
```

**Example:**

```typescript
// Batch configuration update
storage.setItemsSync([
  { key: "ui:theme", value: "dark" },
  { key: "ui:fontSize", value: 14 },
  { key: "ui:showSidebar", value: true },
]);
```

#### Sync Raw Operations

##### getItemRawSync

Synchronously retrieves raw value without deserialization.

```typescript
getItemRawSync<T = any>(key: string, opts?: TransactionOptions): T | null
```

**Example:**

```typescript
// Store and retrieve binary data
const buffer = new Uint8Array([1, 2, 3, 4]);
storage.setItemRawSync("binary-data", buffer);

const retrieved = storage.getItemRawSync<Uint8Array>("binary-data");
console.log(retrieved instanceof Uint8Array); // true
```

##### setItemRawSync

Synchronously stores raw value without serialization.

```typescript
setItemRawSync<T = any>(
  key: string,
  value: T,
  opts?: TransactionOptions
): void
```

#### Sync Metadata Operations

##### getMetaSync

Synchronously retrieves metadata for a storage key.

```typescript
getMetaSync(
  key: string,
  opts?: TransactionOptions & { nativeOnly?: boolean } | boolean
): StorageMeta
```

**Example:**

```typescript
const meta = storage.getMetaSync("user:profile");
console.log("Last modified:", meta.mtime);
console.log("File size:", meta.size);
```

##### setMetaSync

Synchronously sets metadata for a storage key.

```typescript
setMetaSync(
  key: string,
  value: StorageMeta,
  opts?: TransactionOptions
): void
```

##### removeMetaSync

Synchronously removes metadata for a storage key.

```typescript
removeMetaSync(key: string, opts?: TransactionOptions): void
```

#### Sync Key Management

##### getKeysSync

Synchronously retrieves all keys matching the specified base pattern.

```typescript
getKeysSync(base?: string, opts?: GetKeysOptions): string[]
```

**Example:**

```typescript
// Get all user keys
const userKeys = storage.getKeysSync("user:");
console.log("Users:", userKeys); // ['user:profile', 'user:settings', ...]

// Get keys at specific depth
const configKeys = storage.getKeysSync("config:", { maxDepth: 1 });
```

##### clearSync

Synchronously removes all items matching the base pattern.

```typescript
clearSync(base?: string, opts?: TransactionOptions): void
```

**Example:**

```typescript
// Clear all cache entries
storage.clearSync("cache:");

// Clear everything
storage.clearSync();
```

##### flushSync

Synchronously flushes queued operations to the underlying storage.

```typescript
flushSync(base?: string): void
```

**Parameters:**

- `base`: Optional mount base path to flush only a specific mount point

**Description:**

The `flushSync()` method provides a synchronous way to flush queued operations. This is primarily used with the queue driver when you need to ensure operations are persisted immediately in a synchronous code path. The underlying driver must support synchronous operations for this to work.

**Important Notes:**

- Requires the underlying driver to support synchronous methods (`setItemSync`, `removeItemSync`)
- For drivers without sync support, this will throw an error
- Blocks execution until all queued operations are written
- Use sparingly in performance-critical paths due to blocking nature

**Common Use Cases:**

- Configuration file updates that must be persisted immediately
- Test scenarios requiring deterministic state
- Synchronous initialization code where async/await is not available
- Critical data updates in synchronous event handlers

**Example:**

```typescript
import queueDriver from "electron-async-storage/drivers/queue";
import fsDriver from "electron-async-storage/drivers/fs";

const storage = createStorage({
  driver: queueDriver({
    driver: fsDriver({ base: "./config" }),
    flushInterval: 5000,
  }),
});

// Queue synchronous operations
storage.setItemSync("theme", "dark");
storage.setItemSync("language", "en");
storage.setItemSync("notifications", true);

// Operations are queued

// Synchronously flush to ensure immediate persistence
storage.flushSync();
// Now all operations are written to disk synchronously

// Use in initialization code
function initializeConfig() {
  const defaultConfig = {
    theme: "light",
    language: "en",
    notifications: true,
  };

  storage.setItemSync("config", defaultConfig);
  storage.flushSync(); // Ensure config is persisted before continuing

  return defaultConfig;
}
```

**Performance Consideration:**

```typescript
// ⚠️ Avoid in loops - can be very slow
for (let i = 0; i < 1000; i++) {
  storage.setItemSync(`item:${i}`, data[i]);
  storage.flushSync(); // Bad: 1000 blocking flushes!
}

// ✅ Better: Flush once after all operations
for (let i = 0; i < 1000; i++) {
  storage.setItemSync(`item:${i}`, data[i]);
}
storage.flushSync(); // Good: Single flush at end
```

#### Sync Aliases

The storage interface provides convenient synchronous aliases:

```typescript
// Sync alias methods
keysSync: typeof getKeysSync; // storage.keysSync('user:')
getSync: typeof getItemSync; // storage.getSync('user:profile')
setSync: typeof setItemSync; // storage.setSync('user:profile', data)
hasSync: typeof hasItemSync; // storage.hasSync('user:profile')
delSync: typeof removeItemSync; // storage.delSync('user:profile')
removeSync: typeof removeItemSync; // storage.removeSync('user:profile')
```

#### Sync vs Async Usage

**When to use synchronous methods:**

- Simple, immediate operations on memory storage
- Configuration loading at application startup
- Cache operations where blocking is acceptable
- CLI tools and scripts where async overhead is unnecessary

**When to use asynchronous methods:**

- File system operations that may take time
- Network-based storage drivers
- Operations in performance-critical code paths
- When maintaining non-blocking behavior is important

**Mixed usage example:**

```typescript
// Load configuration synchronously at startup
const config = storage.getItemSync("app:config");

// Async operations for user data
const userData = await storage.getItem("user:profile");

// Both APIs work seamlessly together
storage.setItemSync("cache:config", config);
await storage.setItem("cache:user", userData);
```

#### Driver Support for Sync API

| Driver  | Sync Support | Notes                                           |
| ------- | ------------ | ----------------------------------------------- |
| Memory  | ✅ Full      | All operations are inherently synchronous       |
| FS      | ✅ Full      | Uses Node.js synchronous file system operations |
| FS-Lite | ✅ Full      | Lightweight sync file operations                |
| Queue   | ⚠️ Partial   | Bypasses queue for immediate operations         |

**Queue driver behavior:**

- Sync operations bypass the queue system
- Reads check queue state first, then underlying driver
- Writes go directly to underlying driver
- Requires underlying driver to support sync operations

#### Error Handling

Synchronous methods throw errors immediately instead of returning rejected promises:

```typescript
try {
  const data = storage.getItemSync("might-not-exist");
  console.log("Data found:", data);
} catch (error) {
  if (error.message.includes("synchronous operation not supported")) {
    console.log("Driver doesn't support sync operations");
  } else {
    console.error("Storage error:", error);
  }
}
```

#### Aliases

The storage interface provides convenient aliases for common operations:

```typescript
// Async alias methods
keys: typeof getKeys; // storage.keys('user:')
get: typeof getItem; // storage.get('user:profile')
set: typeof setItem; // storage.set('user:profile', data)
has: typeof hasItem; // storage.has('user:profile')
del: typeof removeItem; // storage.del('user:profile')
remove: typeof removeItem; // storage.remove('user:profile')

// Sync alias methods
keysSync: typeof getKeysSync; // storage.keysSync('user:')
getSync: typeof getItemSync; // storage.getSync('user:profile')
setSync: typeof setItemSync; // storage.setSync('user:profile', data)
hasSync: typeof hasItemSync; // storage.hasSync('user:profile')
delSync: typeof removeItemSync; // storage.delSync('user:profile')
removeSync: typeof removeItemSync; // storage.removeSync('user:profile')
```

## Driver API

### defineDriver

Creates a type-safe driver factory.

```typescript
function defineDriver<OptionsT = any, InstanceT = never>(
  factory: (opts: OptionsT) => Driver<OptionsT, InstanceT>
): (opts: OptionsT) => Driver<OptionsT, InstanceT>;
```

**Example:**

```typescript
import { defineDriver } from "electron-async-storage/drivers/utils";

interface MyDriverOptions {
  connectionString: string;
  timeout?: number;
}

export default defineDriver<MyDriverOptions>((options) => ({
  name: "my-driver",
  options,

  async getItem(key) {
    // Implementation
  },

  async setItem(key, value) {
    // Implementation
  },

  // ... other methods
}));
```

### Driver Interface

```typescript
interface Driver<OptionsT = any, InstanceT = any> {
  name?: string;
  flags?: DriverFlags;
  options?: OptionsT;
  getInstance?: () => InstanceT;

  // Required methods
  hasItem(key: string, opts: TransactionOptions): MaybePromise<boolean>;
  getItem(key: string, opts?: TransactionOptions): MaybePromise<StorageValue>;
  getKeys(base: string, opts: GetKeysOptions): MaybePromise<string[]>;

  // Optional methods
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
  dispose?(): MaybePromise<void>;
  watch?(callback: WatchCallback): MaybePromise<Unwatch>;

  // Batch operations
  getItems?(
    items: Array<{ key: string; options?: TransactionOptions }>,
    commonOptions?: TransactionOptions
  ): MaybePromise<Array<{ key: string; value: StorageValue }>>;
  setItems?(
    items: Array<{ key: string; value: string; options?: TransactionOptions }>,
    commonOptions?: TransactionOptions
  ): MaybePromise<void>;

  // Raw operations
  getItemRaw?(key: string, opts: TransactionOptions): MaybePromise<unknown>;
  setItemRaw?(
    key: string,
    value: any,
    opts: TransactionOptions
  ): MaybePromise<void>;

  // Synchronous API methods (optional)
  hasItemSync?(key: string, opts: TransactionOptions): boolean;
  getItemSync?(key: string, opts?: TransactionOptions): StorageValue;
  getKeysSync?(base: string, opts: GetKeysOptions): string[];
  setItemSync?(key: string, value: string, opts: TransactionOptions): void;
  removeItemSync?(key: string, opts: TransactionOptions): void;
  getMetaSync?(key: string, opts: TransactionOptions): StorageMeta | null;
  clearSync?(base: string, opts: TransactionOptions): void;

  // Synchronous batch operations
  getItemsSync?(
    items: Array<{ key: string; options?: TransactionOptions }>,
    commonOptions?: TransactionOptions
  ): Array<{ key: string; value: StorageValue }>;
  setItemsSync?(
    items: Array<{ key: string; value: string; options?: TransactionOptions }>,
    commonOptions?: TransactionOptions
  ): void;

  // Synchronous raw operations
  getItemRawSync?(key: string, opts: TransactionOptions): unknown;
  setItemRawSync?(key: string, value: any, opts: TransactionOptions): void;
}
```

#### Implementing Synchronous Methods

When creating custom drivers, synchronous methods are optional but recommended for drivers that can operate synchronously:

```typescript
import { defineDriver } from "electron-async-storage/drivers/utils";

interface MyDriverOptions {
  data: Map<string, any>;
}

export default defineDriver<MyDriverOptions>((options) => {
  const { data } = options;

  return {
    name: "my-custom-driver",
    options,

    // Async methods (required)
    async hasItem(key) {
      return data.has(key);
    },

    async getItem(key) {
      return data.get(key) ?? null;
    },

    async setItem(key, value) {
      data.set(key, value);
    },

    async getKeys() {
      return [...data.keys()];
    },

    // Sync methods (recommended for in-memory operations)
    hasItemSync(key) {
      return data.has(key);
    },

    getItemSync(key) {
      return data.get(key) ?? null;
    },

    setItemSync(key, value) {
      data.set(key, value);
    },

    getKeysSync() {
      return [...data.keys()];
    },
  };
});
```

**Notes for driver implementors:**

- Sync methods should only be implemented if the operation can complete without blocking I/O
- File system drivers should use Node.js synchronous file operations (`fs.readFileSync`, etc.)
- Network-based drivers typically should NOT implement sync methods
- If sync methods are not available, the storage layer will throw appropriate errors

## Utility Functions

### snapshot

Creates a snapshot of storage data.

```typescript
function snapshot(storage: Storage, base: string): Promise<Snapshot<string>>;

type Snapshot<T = string> = Record<string, T>;
```

**Example:**

```typescript
import { snapshot } from "electron-async-storage";

// Create backup of all user data
const backup = await snapshot(storage, "user:");
console.log("Backed up keys:", Object.keys(backup));
```

### restoreSnapshot

Restores data from a snapshot.

```typescript
function restoreSnapshot(
  storage: Storage,
  snapshot: Snapshot<StorageValue>,
  base?: string
): Promise<void>;
```

**Example:**

```typescript
import { restoreSnapshot } from "electron-async-storage";

// Restore from backup
await restoreSnapshot(storage, backup, "user:");
```

### prefixStorage

Creates a namespaced storage view.

```typescript
function prefixStorage<T extends StorageValue>(
  storage: Storage<T>,
  base: string
): Storage<T>;
```

**Example:**

```typescript
import { prefixStorage } from "electron-async-storage";

// Create user-specific storage view
const userStorage = prefixStorage(storage, "users:john:");

// Operations are automatically prefixed
await userStorage.setItem("profile", userData); // Stores as 'users:john:profile'
const profile = await userStorage.getItem("profile"); // Reads 'users:john:profile'
const keys = await userStorage.getKeys(); // Returns keys without 'users:john:' prefix
```

### Utility Functions (Driver Utils)

#### normalizeKey

Normalizes storage keys by converting separators and removing invalid characters.

```typescript
function normalizeKey(key: string | undefined, sep: ":" | "/" = ":"): string;
```

#### joinKeys

Joins multiple key segments into a normalized key.

```typescript
function joinKeys(...keys: string[]): string;
```

#### createError

Creates standardized error messages for drivers.

```typescript
function createError(
  driver: string,
  message: string,
  opts?: ErrorOptions
): Error;
```

#### createRequiredError

Creates error for missing required driver options.

```typescript
function createRequiredError(driver: string, name: string | string[]): Error;
```

## Type Definitions

### Core Types

```typescript
// Storage value types
type StorageValue = null | string | number | boolean | object;

// Maybe promise (sync or async)
type MaybePromise<T> = T | Promise<T>;

// Watch event types
type WatchEvent = "update" | "remove";
type WatchCallback = (event: WatchEvent, key: string) => any;
type Unwatch = () => MaybePromise<void>;
```

### Storage Metadata

```typescript
interface StorageMeta {
  atime?: Date; // Access time
  mtime?: Date; // Modification time
  ttl?: number; // Time to live
  [key: string]: StorageValue | Date | undefined; // Custom metadata
}
```

### Transaction Options

```typescript
type TransactionOptions = Record<string, any>;

interface GetKeysOptions extends TransactionOptions {
  maxDepth?: number; // Maximum depth for hierarchical keys
}
```

### Driver Flags

```typescript
interface DriverFlags {
  maxDepth?: boolean; // Driver supports native depth filtering
  ttl?: boolean; // Driver supports time-to-live
}
```

### Migration Types

```typescript
type MigrationFunction<T extends StorageValue = StorageValue> = (
  storage: Storage<T>
) => Promise<void> | void;

interface MigrationOptions<T extends StorageValue = StorageValue> {
  [version: number]: MigrationFunction<T>;
}

interface MigrationHooks<T extends StorageValue = StorageValue> {
  beforeMigration?: (
    fromVersion: number,
    toVersion: number,
    storage: Storage<T>
  ) => Promise<void> | void;
  afterMigration?: (
    fromVersion: number,
    toVersion: number,
    storage: Storage<T>
  ) => Promise<void> | void;
  onMigrationError?: (
    error: Error,
    fromVersion: number,
    toVersion: number,
    storage: Storage<T>
  ) => Promise<void> | void;
}
```

### Queue Options

```typescript
interface QueueOptions {
  batchSize?: number; // Operations per batch (default: 100)
  flushInterval?: number; // Auto-flush interval in ms (default: 1000)
  maxQueueSize?: number; // Maximum queue size (default: 1000)
  mergeUpdates?: boolean; // Merge duplicate key updates (default: true)
}
```

## Error Types

### Standard Errors

```typescript
// Driver configuration error
class DriverConfigError extends Error {
  constructor(driver: string, option: string) {
    super(
      `[electron-async-storage] [${driver}] Missing required option \`${option}\``
    );
  }
}

// Key validation error
class InvalidKeyError extends Error {
  constructor(driver: string, key: string) {
    super(
      `[electron-async-storage] [${driver}] Invalid key: ${JSON.stringify(key)}`
    );
  }
}

// Migration error
class MigrationError extends Error {
  constructor(fromVersion: number, toVersion: number, originalError: Error) {
    super(
      `Migration failed from v${fromVersion} to v${toVersion}: ${originalError.message}`
    );
    this.cause = originalError;
  }
}
```

## Configuration Options

### File System Driver Options

```typescript
interface FSStorageOptions {
  base?: string; // Base directory (required)
  ignore?: string[]; // Ignore patterns (anymatch format)
  readOnly?: boolean; // Read-only mode
  noClear?: boolean; // Disable clear operations
  watchOptions?: ChokidarOptions; // File watcher options
}
```

### Queue Driver Options

```typescript
interface QueueDriverOptions extends QueueOptions {
  driver: Driver; // Wrapped driver (required)
}
```

### Built-in Driver Names

```typescript
type BuiltinDriverName = "fs-lite" | "fsLite" | "fs" | "memory" | "queue";

type BuiltinDriverOptions = {
  "fs-lite": FSStorageOptions;
  fsLite: FSStorageOptions;
  fs: FSStorageOptions;
  queue: QueueDriverOptions;
};
```

This comprehensive API reference provides detailed documentation for all aspects of the electron-async-storage library, enabling developers to fully leverage its powerful features and capabilities.
