# API Reference

This comprehensive API reference covers all methods, interfaces, and types available in electron-async-storage.

## Table of Contents

- [Storage API](#storage-api)
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
): Storage<T>

interface CreateStorageOptions<T extends StorageValue = StorageValue> {
  driver?: Driver                     // Storage driver (default: memory)
  version?: number                   // Schema version for migrations
  migrations?: MigrationOptions<T>   // Migration functions
  migrationHooks?: MigrationHooks<T> // Migration hooks
}
```

**Example:**
```typescript
import { createStorage } from 'electron-async-storage'
import fsDriver from 'electron-async-storage/drivers/fs'

const storage = createStorage({
  driver: fsDriver({ base: './data' }),
  version: 2,
  migrations: {
    1: async (storage) => { /* migration logic */ },
    2: async (storage) => { /* migration logic */ }
  }
})
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
const exists = await storage.hasItem('user:profile')
if (exists) {
  console.log('User profile found')
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
const userProfile = await storage.getItem<UserProfile>('user:profile')
if (userProfile) {
  console.log(`Welcome ${userProfile.name}`)
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
await storage.setItem('user:profile', {
  name: 'John Doe',
  email: 'john@example.com',
  lastLogin: new Date()
})
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
await storage.removeItem('user:session')

// Remove item and its metadata
await storage.removeItem('user:session', { removeMeta: true })
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
  'user:profile',
  'user:settings',
  { key: 'user:preferences', options: { timeout: 5000 } }
])

for (const { key, value } of results) {
  console.log(`${key}:`, value)
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
  { key: 'config:theme', value: 'dark' },
  { key: 'config:language', value: 'en' },
  { key: 'config:notifications', value: true }
])
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
const buffer = new Uint8Array([1, 2, 3, 4])
await storage.setItemRaw('binary-data', buffer)

// Retrieve binary data
const retrieved = await storage.getItemRaw<Uint8Array>('binary-data')
console.log(retrieved instanceof Uint8Array) // true
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
const meta = await storage.getMeta('user:profile')
console.log('Last modified:', meta.mtime)
console.log('File size:', meta.size)
console.log('Custom metadata:', meta.version)
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
await storage.setMeta('cached-data', {
  ttl: Date.now() + 3_600_000,
  source: 'api-v2',
  priority: 'high'
})
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
const userKeys = await storage.getKeys('user:')
console.log('Users:', userKeys) // ['user:profile', 'user:settings', ...]

// Get keys at specific depth
const topLevelConfig = await storage.getKeys('config:', { maxDepth: 1 })
console.log('Config sections:', topLevelConfig) // ['config:ui', 'config:app']
```

##### clear

Removes all items matching the base pattern.

```typescript
clear(base?: string, opts?: TransactionOptions): Promise<void>
```

**Example:**
```typescript
// Clear all cache entries
await storage.clear('cache:')

// Clear everything
await storage.clear()
```

#### Mount System

##### mount

Mounts a driver at the specified base path.

```typescript
mount(base: string, driver: Driver): Storage
```

**Example:**
```typescript
import fsDriver from 'electron-async-storage/drivers/fs'
import memoryDriver from 'electron-async-storage/drivers/memory'

const storage = createStorage()

// Mount file system driver for configuration
storage.mount('config', fsDriver({ base: './config' }))

// Mount memory driver for cache
storage.mount('cache', memoryDriver())

// Operations are automatically routed
await storage.setItem('config:app-settings', settings)  // → File system
await storage.setItem('cache:user-session', session)    // → Memory
```

##### unmount

Unmounts a driver from the specified base path.

```typescript
unmount(base: string, dispose?: boolean): Promise<void>
```

**Example:**
```typescript
// Unmount and dispose driver
await storage.unmount('cache', true)

// Unmount without disposing (driver can be reused)
await storage.unmount('config', false)
```

##### getMount

Gets information about the mount point for a key.

```typescript
getMount(key?: string): { base: string; driver: Driver }
```

**Example:**
```typescript
const mount = storage.getMount('config:app-settings')
console.log('Base path:', mount.base)        // 'config:'
console.log('Driver name:', mount.driver.name) // 'fs'
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
const allMounts = storage.getMounts()

// Get mounts for specific base
const configMounts = storage.getMounts('config:', { parents: true })
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
  console.log(`Storage ${event}: ${key}`)

  if (key.startsWith('config:')) {
    // Reload configuration
    reloadConfig()
  }
})

// Stop watching
await unwatch()
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
const currentVersion = await storage.getStorageVersion()
if (currentVersion < 3) {
  console.log('Running migrations...')
  await storage.migrate()
  console.log('Migrations completed')
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
process.on('beforeExit', async () => {
  await storage.dispose()
})
```

#### Aliases

The storage interface provides convenient aliases for common operations:

```typescript
// Alias methods
keys: typeof getKeys        // storage.keys('user:')
get: typeof getItem         // storage.get('user:profile')
set: typeof setItem         // storage.set('user:profile', data)
has: typeof hasItem         // storage.has('user:profile')
del: typeof removeItem      // storage.del('user:profile')
remove: typeof removeItem   // storage.remove('user:profile')
```

## Driver API

### defineDriver

Creates a type-safe driver factory.

```typescript
function defineDriver<OptionsT = any, InstanceT = never>(
  factory: (opts: OptionsT) => Driver<OptionsT, InstanceT>
): (opts: OptionsT) => Driver<OptionsT, InstanceT>
```

**Example:**
```typescript
import { defineDriver } from 'electron-async-storage/drivers/utils'

interface MyDriverOptions {
  connectionString: string
  timeout?: number
}

export default defineDriver<MyDriverOptions>((options) => ({
  name: 'my-driver',
  options,

  async getItem(key) {
    // Implementation
  },

  async setItem(key, value) {
    // Implementation
  },

  // ... other methods
}))
```

### Driver Interface

```typescript
interface Driver<OptionsT = any, InstanceT = any> {
  name?: string
  flags?: DriverFlags
  options?: OptionsT
  getInstance?: () => InstanceT

  // Required methods
  hasItem(key: string, opts: TransactionOptions): MaybePromise<boolean>
  getItem(key: string, opts?: TransactionOptions): MaybePromise<StorageValue>
  getKeys(base: string, opts: GetKeysOptions): MaybePromise<string[]>

  // Optional methods
  setItem?(key: string, value: string, opts: TransactionOptions): MaybePromise<void>
  removeItem?(key: string, opts: TransactionOptions): MaybePromise<void>
  getMeta?(key: string, opts: TransactionOptions): MaybePromise<StorageMeta | null>
  clear?(base: string, opts: TransactionOptions): MaybePromise<void>
  dispose?(): MaybePromise<void>
  watch?(callback: WatchCallback): MaybePromise<Unwatch>

  // Batch operations
  getItems?(items: Array<{key: string, options?: TransactionOptions}>, commonOptions?: TransactionOptions): MaybePromise<Array<{key: string, value: StorageValue}>>
  setItems?(items: Array<{key: string, value: string, options?: TransactionOptions}>, commonOptions?: TransactionOptions): MaybePromise<void>

  // Raw operations
  getItemRaw?(key: string, opts: TransactionOptions): MaybePromise<unknown>
  setItemRaw?(key: string, value: any, opts: TransactionOptions): MaybePromise<void>
}
```

## Utility Functions

### snapshot

Creates a snapshot of storage data.

```typescript
function snapshot(storage: Storage, base: string): Promise<Snapshot<string>>

type Snapshot<T = string> = Record<string, T>
```

**Example:**
```typescript
import { snapshot } from 'electron-async-storage'

// Create backup of all user data
const backup = await snapshot(storage, 'user:')
console.log('Backed up keys:', Object.keys(backup))
```

### restoreSnapshot

Restores data from a snapshot.

```typescript
function restoreSnapshot(
  storage: Storage,
  snapshot: Snapshot<StorageValue>,
  base?: string
): Promise<void>
```

**Example:**
```typescript
import { restoreSnapshot } from 'electron-async-storage'

// Restore from backup
await restoreSnapshot(storage, backup, 'user:')
```

### prefixStorage

Creates a namespaced storage view.

```typescript
function prefixStorage<T extends StorageValue>(
  storage: Storage<T>,
  base: string
): Storage<T>
```

**Example:**
```typescript
import { prefixStorage } from 'electron-async-storage'

// Create user-specific storage view
const userStorage = prefixStorage(storage, 'users:john:')

// Operations are automatically prefixed
await userStorage.setItem('profile', userData)    // Stores as 'users:john:profile'
const profile = await userStorage.getItem('profile') // Reads 'users:john:profile'
const keys = await userStorage.getKeys()          // Returns keys without 'users:john:' prefix
```

### Utility Functions (Driver Utils)

#### normalizeKey

Normalizes storage keys by converting separators and removing invalid characters.

```typescript
function normalizeKey(key: string | undefined, sep: ":" | "/" = ":"): string
```

#### joinKeys

Joins multiple key segments into a normalized key.

```typescript
function joinKeys(...keys: string[]): string
```

#### createError

Creates standardized error messages for drivers.

```typescript
function createError(driver: string, message: string, opts?: ErrorOptions): Error
```

#### createRequiredError

Creates error for missing required driver options.

```typescript
function createRequiredError(driver: string, name: string | string[]): Error
```

## Type Definitions

### Core Types

```typescript
// Storage value types
type StorageValue = null | string | number | boolean | object

// Maybe promise (sync or async)
type MaybePromise<T> = T | Promise<T>

// Watch event types
type WatchEvent = "update" | "remove"
type WatchCallback = (event: WatchEvent, key: string) => any
type Unwatch = () => MaybePromise<void>
```

### Storage Metadata

```typescript
interface StorageMeta {
  atime?: Date          // Access time
  mtime?: Date          // Modification time
  ttl?: number          // Time to live
  [key: string]: StorageValue | Date | undefined  // Custom metadata
}
```

### Transaction Options

```typescript
type TransactionOptions = Record<string, any>

interface GetKeysOptions extends TransactionOptions {
  maxDepth?: number  // Maximum depth for hierarchical keys
}
```

### Driver Flags

```typescript
interface DriverFlags {
  maxDepth?: boolean  // Driver supports native depth filtering
  ttl?: boolean       // Driver supports time-to-live
}
```

### Migration Types

```typescript
type MigrationFunction<T extends StorageValue = StorageValue> = (
  storage: Storage<T>
) => Promise<void> | void

interface MigrationOptions<T extends StorageValue = StorageValue> {
  [version: number]: MigrationFunction<T>
}

interface MigrationHooks<T extends StorageValue = StorageValue> {
  beforeMigration?: (fromVersion: number, toVersion: number, storage: Storage<T>) => Promise<void> | void
  afterMigration?: (fromVersion: number, toVersion: number, storage: Storage<T>) => Promise<void> | void
  onMigrationError?: (error: Error, fromVersion: number, toVersion: number, storage: Storage<T>) => Promise<void> | void
}
```

### Queue Options

```typescript
interface QueueOptions {
  batchSize?: number      // Operations per batch (default: 100)
  flushInterval?: number  // Auto-flush interval in ms (default: 1000)
  maxQueueSize?: number   // Maximum queue size (default: 1000)
  mergeUpdates?: boolean  // Merge duplicate key updates (default: true)
}
```

## Error Types

### Standard Errors

```typescript
// Driver configuration error
class DriverConfigError extends Error {
  constructor(driver: string, option: string) {
    super(`[electron-async-storage] [${driver}] Missing required option \`${option}\``)
  }
}

// Key validation error
class InvalidKeyError extends Error {
  constructor(driver: string, key: string) {
    super(`[electron-async-storage] [${driver}] Invalid key: ${JSON.stringify(key)}`)
  }
}

// Migration error
class MigrationError extends Error {
  constructor(fromVersion: number, toVersion: number, originalError: Error) {
    super(`Migration failed from v${fromVersion} to v${toVersion}: ${originalError.message}`)
    this.cause = originalError
  }
}
```

## Configuration Options

### File System Driver Options

```typescript
interface FSStorageOptions {
  base?: string                    // Base directory (required)
  ignore?: string[]               // Ignore patterns (anymatch format)
  readOnly?: boolean              // Read-only mode
  noClear?: boolean              // Disable clear operations
  watchOptions?: ChokidarOptions // File watcher options
}
```

### Queue Driver Options

```typescript
interface QueueDriverOptions extends QueueOptions {
  driver: Driver  // Wrapped driver (required)
}
```

### Built-in Driver Names

```typescript
type BuiltinDriverName = "fs-lite" | "fsLite" | "fs" | "memory" | "queue"

type BuiltinDriverOptions = {
  "fs-lite": FSStorageOptions
  "fsLite": FSStorageOptions
  "fs": FSStorageOptions
  "queue": QueueDriverOptions
}
```

This comprehensive API reference provides detailed documentation for all aspects of the electron-async-storage library, enabling developers to fully leverage its powerful features and capabilities.