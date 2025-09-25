# Architecture Guide

This document provides a comprehensive deep dive into the internal architecture of electron-async-storage, covering the core systems, data flow, and implementation details.

## Table of Contents

- [Core Architecture Overview](#core-architecture-overview)
- [Storage Core System](#storage-core-system)
- [Mount-Based Driver System](#mount-based-driver-system)
- [Key Normalization and Routing](#key-normalization-and-routing)
- [Serialization Engine](#serialization-engine)
- [Batch Operations System](#batch-operations-system)
- [Real-Time Watching Infrastructure](#real-time-watching-infrastructure)
- [Migration Framework](#migration-framework)
- [Memory Management](#memory-management)
- [Error Handling Strategy](#error-handling-strategy)
- [Performance Optimizations](#performance-optimizations)

## Core Architecture Overview

electron-async-storage implements a layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                      Storage API Layer                     │
│  (High-level interface with type safety and validation)    │
├─────────────────────────────────────────────────────────────┤
│                    Mount Management                         │
│     (Route operations to appropriate drivers)              │
├─────────────────────────────────────────────────────────────┤
│                  Serialization Layer                       │
│    (superjson-based complex object serialization)          │
├─────────────────────────────────────────────────────────────┤
│                   Driver Interface                         │
│      (Standardized driver contract and lifecycle)          │
├─────────────────────────────────────────────────────────────┤
│                 Driver Implementations                     │
│  Memory │ FileSystem │ FileSystem-Lite │ Queue │ Custom    │
└─────────────────────────────────────────────────────────────┘
```

## Storage Core System

The storage core (`src/storage.ts`) is the central orchestrator that manages all storage operations.

### Storage Context

```typescript
interface StorageCTX {
  mounts: Record<string, Driver>         // Mounted drivers by base path
  mountpoints: string[]                  // Sorted mount points (longest first)
  watching: boolean                      // Global watch state
  unwatch: Record<string, Unwatch>       // Cleanup functions per mount
  watchListeners: WatchCallback[]        // Registered watch callbacks
}
```

### Mount Resolution Algorithm

The mount resolution follows a longest-prefix-match strategy:

```typescript
function getMount(key: string): MountInfo {
  // Iterate through mount points (sorted by length, descending)
  for (const base of context.mountpoints) {
    if (key.startsWith(base)) {
      return {
        base,
        relativeKey: key.slice(base.length),
        driver: context.mounts[base]
      }
    }
  }
  // Fallback to root mount
  return {
    base: "",
    relativeKey: key,
    driver: context.mounts[""]
  }
}
```

This ensures that more specific mounts take precedence over general ones:
- `cache:api:v1` → mounted at `cache:api:`
- `cache:user` → mounted at `cache:`
- `other:data` → mounted at `""` (root)

### Operation Flow

1. **Key Normalization**: Convert separators, remove query params
2. **Mount Resolution**: Find appropriate driver based on key prefix
3. **Serialization**: Convert complex objects to strings (if needed)
4. **Driver Operation**: Execute operation on selected driver
5. **Deserialization**: Convert strings back to objects (if needed)
6. **Change Notification**: Trigger watch callbacks (if watching enabled)

## Mount-Based Driver System

The mount system provides a powerful way to compose storage from multiple drivers.

### Mount Point Management

Mount points are maintained in sorted order (longest first) for efficient prefix matching:

```typescript
// Adding a new mount
mount(base: string, driver: Driver) {
  base = normalizeBaseKey(base)
  if (base && context.mounts[base]) {
    throw new Error(`already mounted at ${base}`)
  }

  if (base) {
    context.mountpoints.push(base)
    // Sort by length (descending) for correct precedence
    context.mountpoints.sort((a, b) => b.length - a.length)
  }

  context.mounts[base] = driver

  // Set up watching if global watching is enabled
  if (context.watching) {
    setupDriverWatch(driver, base)
  }

  return storage
}
```

### Mount Examples

```typescript
const storage = createStorage()

// Mount different drivers for different purposes
storage.mount('cache', memoryDriver())           // cache:* → memory
storage.mount('config', fsDriver({ base: './config' }))  // config:* → filesystem
storage.mount('config:secure', encryptedDriver())        // config:secure:* → encrypted

// Operations are automatically routed:
await storage.setItem('cache:user-session', data)    // → memory driver
await storage.setItem('config:app-settings', settings)  // → filesystem driver
await storage.setItem('config:secure:api-keys', keys)   // → encrypted driver
```

## Key Normalization and Routing

### Key Normalization Process

Keys undergo normalization to ensure consistency:

```typescript
function normalizeKey(key?: string): string {
  if (!key) return ""

  return key
    .split("?")[0]                    // Remove query parameters
    ?.replace(/[/\\]/g, ":")         // Convert separators to colons
    .replace(/:+/g, ":")             // Collapse multiple colons
    .replace(/^:|:$/g, "")           // Remove leading/trailing colons
    || ""
}

// Examples:
normalizeKey("user/profile?v=1")     // → "user:profile"
normalizeKey("\\config\\\\app\\")    // → "config:app"
normalizeKey(":::cache:::data:::")   // → "cache:data"
```

### Base Key Handling

Base keys get special treatment for mount operations:

```typescript
function normalizeBaseKey(base?: string): string {
  base = normalizeKey(base)
  return base ? base + ":" : ""
}

// This ensures proper mount behavior:
storage.mount("config", driver)
await storage.setItem("app-settings", data)  // Stored as "config:app-settings"
```

### Key Filtering and Depth Control

The system supports sophisticated key filtering:

```typescript
function filterKeyByDepth(key: string, depth: number | undefined): boolean {
  if (depth === undefined) return true

  let substrCount = 0
  let index = key.indexOf(":")

  while (index > -1) {
    substrCount++
    index = key.indexOf(":", index + 1)
  }

  return substrCount <= depth
}

// Usage:
await storage.getKeys("config", { maxDepth: 1 })
// Returns only "config:app", not "config:app:theme" (depth 2)
```

## Serialization Engine

The serialization engine handles complex JavaScript objects using superjson.

### Supported Types

- **Primitives**: string, number, boolean, null, undefined
- **Collections**: Object, Array, Set, Map
- **Built-ins**: Date, RegExp, Error, URL
- **Modern Types**: BigInt
- **Binary Data**: Uint8Array (via base64 encoding)

### Serialization Process

```typescript
function stringify(value: any): string {
  // Check if value is superjson-compatible
  if (isPrimitive(value) || isPureObject(value) || Array.isArray(value) ||
      value instanceof Date || value instanceof RegExp ||
      value instanceof Set || value instanceof Map ||
      value instanceof Error || value instanceof URL ||
      value === undefined || typeof value === "bigint") {
    return superjson.stringify(value)
  }

  // Fallback to toJSON method
  if (typeof value.toJSON === "function") {
    return stringify(value.toJSON())
  }

  throw new Error("[electron-async-storage] Cannot stringify value!")
}
```

### Deserialization with Safety

```typescript
function safeSuperjsonParse(value: any): any {
  if (typeof value !== "string") return value
  if (value === "" || value === "{}") return null

  try {
    return superjson.parse(value)
  } catch {
    return null  // Safe fallback for corrupted data
  }
}
```

### Raw Value Handling

For binary data and custom serialization:

```typescript
const BASE64_PREFIX = "base64:"

function serializeRaw(value: any): string {
  if (typeof value === "string") return value
  return BASE64_PREFIX + base64Encode(value)
}

function deserializeRaw(value: any): any {
  if (typeof value !== "string") return value
  if (!value.startsWith(BASE64_PREFIX)) return value
  return base64Decode(value.slice(BASE64_PREFIX.length))
}
```

## Batch Operations System

Batch operations provide significant performance improvements by reducing driver calls.

### Batch Item Processing

```typescript
type BatchItem = {
  driver: Driver
  base: string
  items: Array<{
    key: string
    relativeKey: string
    value?: StorageValue
    options?: TransactionOptions
  }>
}

function runBatch(
  items: (string | { key: string; value?: StorageValue; options?: TransactionOptions })[],
  commonOptions: TransactionOptions | undefined,
  operation: (batch: BatchItem) => Promise<any>
): Promise<any[]> {
  const batches = new Map<string, BatchItem>()

  // Group items by mount point
  for (const item of items) {
    const key = typeof item === "string" ? item : item.key
    const mount = getMount(normalizeKey(key))

    let batch = batches.get(mount.base)
    if (!batch) {
      batch = { driver: mount.driver, base: mount.base, items: [] }
      batches.set(mount.base, batch)
    }

    batch.items.push({
      key,
      relativeKey: mount.relativeKey,
      value: typeof item === "string" ? undefined : item.value,
      options: typeof item === "string" ? commonOptions :
               { ...commonOptions, ...item.options }
    })
  }

  // Execute batched operations
  return Promise.all([...batches.values()].map(operation)).then(r => r.flat())
}
```

### Batch Operation Examples

```typescript
// Instead of:
for (const key of keys) {
  const value = await storage.getItem(key)  // N driver calls
}

// Use:
const results = await storage.getItems(keys)  // 1 batched driver call per mount
```

## Real-Time Watching Infrastructure

The watching system provides real-time notifications for storage changes.

### Watch State Management

```typescript
const onChange: WatchCallback = (event, key) => {
  if (!context.watching) return

  key = normalizeKey(key)
  for (const listener of context.watchListeners) {
    listener(event, key)
  }
}

async function startWatch() {
  if (context.watching) return

  context.watching = true
  for (const mountpoint in context.mounts) {
    context.unwatch[mountpoint] = await watch(
      context.mounts[mountpoint],
      onChange,
      mountpoint
    )
  }
}
```

### Driver Watch Integration

```typescript
function watch(driver: Driver, onChange: WatchCallback, base: string): Unwatch {
  return driver.watch
    ? driver.watch((event, key) => onChange(event, base + key))
    : () => {}  // No-op for drivers without watch support
}
```

### Automatic Change Detection

For drivers without native watching, changes are detected during operations:

```typescript
async setItem(key: string, value: T, opts = {}) {
  // ... perform set operation ...

  // Trigger change event if driver doesn't have native watching
  if (!driver.watch) {
    onChange("update", key)
  }
}
```

## Migration Framework

The migration system enables version-based schema evolution.

### Migration Execution Flow

```typescript
async function runMigrations<T extends StorageValue>(
  storage: Storage<T>,
  options: CreateStorageOptions<T>
): Promise<void> {
  const { version: targetVersion, migrations, migrationHooks } = options

  if (targetVersion === undefined || !migrations) return

  try {
    // Get current version
    const currentVersion = (await storage.getItem(STORAGE_VERSION_KEY)) as number || 0

    if (currentVersion >= targetVersion) return

    // Execute pre-migration hook
    await migrationHooks?.beforeMigration?.(currentVersion, targetVersion, storage)

    // Run migrations sequentially
    for (let version = currentVersion + 1; version <= targetVersion; version++) {
      const migrationFn = migrations[version]
      if (migrationFn) {
        await migrationFn(storage)
      }
    }

    // Update version
    await storage._setItemInternal(STORAGE_VERSION_KEY, targetVersion)

    // Execute post-migration hook
    await migrationHooks?.afterMigration?.(currentVersion, targetVersion, storage)

  } catch (error) {
    // Execute error hook
    await migrationHooks?.onMigrationError?.(
      error instanceof Error ? error : new Error(String(error)),
      currentVersion,
      targetVersion,
      storage
    )
    throw error
  }
}
```

### Migration Safety Features

- **Atomic Operations**: Migrations use internal methods to bypass normal serialization
- **Version Tracking**: Automatic version management prevents re-running migrations
- **Error Recovery**: Comprehensive error handling with rollback capabilities
- **Hook System**: Pre/post migration hooks for backup and cleanup operations

## Memory Management

### Resource Disposal

```typescript
async function dispose(driver: Driver) {
  if (typeof driver.dispose === "function") {
    await asyncCall(driver.dispose)
  }
}

// Storage disposal
async dispose() {
  await Promise.all(
    Object.values(context.mounts).map(driver => dispose(driver))
  )
}
```

### Watch Cleanup

```typescript
async function stopWatch() {
  if (!context.watching) return

  for (const mountpoint in context.unwatch) {
    await context.unwatch[mountpoint]?.()
  }
  context.unwatch = {}
  context.watching = false
}
```

## Error Handling Strategy

### Graceful Degradation

The system is designed to gracefully handle various error conditions:

- **Missing Drivers**: Operations on unmounted paths fall back to root driver
- **Serialization Errors**: Fallback to null values with error logging
- **Watch Failures**: Continue operation without watching capabilities
- **Migration Errors**: Rollback mechanisms and error hooks

### Error Types

```typescript
function createError(driver: string, message: string, opts?: ErrorOptions) {
  const err = new Error(`[electron-async-storage] [${driver}] ${message}`, opts)
  if (Error.captureStackTrace) {
    Error.captureStackTrace(err, createError)
  }
  return err
}

function createRequiredError(driver: string, name: string | string[]) {
  if (Array.isArray(name)) {
    return createError(driver, `Missing some of the required options ${name.map(n => \`\`${n}\`\`).join(", ")}`)
  }
  return createError(driver, `Missing required option \`${name}\`.`)
}
```

## Performance Optimizations

### Async Operation Handling

```typescript
function asyncCall<T extends (...args: any) => any>(
  fn: T,
  ...args: any[]
): Promise<Awaited<ReturnType<T>>> {
  try {
    return wrapToPromise(fn(...args))
  } catch (error) {
    return Promise.reject(error)
  }
}

function wrapToPromise<T>(value: T): Promise<Awaited<T>> {
  if (!value || typeof (value as any).then !== "function") {
    return Promise.resolve(value as Awaited<T>)
  }
  return value as Promise<Awaited<T>>
}
```

### Mount Point Sorting

Mount points are kept sorted by length (descending) to ensure O(n) lookup performance with early termination:

```typescript
context.mountpoints.sort((a, b) => b.length - a.length)
```

### Key Processing Optimization

Key normalization is optimized to minimize string operations:

```typescript
// Single pass normalization with minimal allocations
function normalizeKey(key?: string): string {
  if (!key) return ""
  return key.split("?")[0]?.replace(/[/\\]/g, ":").replace(/:+/g, ":").replace(/^:|:$/g, "") || ""
}
```

This architecture provides a robust, performant, and extensible foundation for the electron-async-storage library, enabling sophisticated storage patterns while maintaining simplicity for basic use cases.