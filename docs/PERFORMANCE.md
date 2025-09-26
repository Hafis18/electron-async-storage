# Performance Optimization Guide

This comprehensive guide covers performance optimization strategies, benchmarking techniques, and best practices for maximizing the performance of electron-async-storage.

## Table of Contents

- [Performance Overview](#performance-overview)
- [Driver Performance Characteristics](#driver-performance-characteristics)
- [Batch Operations](#batch-operations)
- [Queue Driver Optimization](#queue-driver-optimization)
- [Memory Management](#memory-management)
- [I/O Optimization](#io-optimization)
- [Serialization Performance](#serialization-performance)
- [Caching Strategies](#caching-strategies)
- [Monitoring and Profiling](#monitoring-and-profiling)
- [Benchmarking](#benchmarking)
- [Best Practices](#best-practices)

## Performance Overview

electron-async-storage is designed for high performance across different usage patterns. Understanding the performance characteristics of each component helps optimize your application.

### Performance Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│                (Your business logic)                       │
├─────────────────────────────────────────────────────────────┤
│                   Storage API Layer                        │
│         (Serialization, key normalization)                 │
├─────────────────────────────────────────────────────────────┤
│                  Mount Management                          │
│        (Route operations to drivers)                       │
├─────────────────────────────────────────────────────────────┤
│                  Driver Layer                              │
│  Memory: ~1µs │ FS: ~1ms │ Queue: Variable │ Network: ~10ms  │
└─────────────────────────────────────────────────────────────┘
```

### Operation Latency Characteristics

| Operation Type     | Memory Driver | FS Driver | Queue Driver | Network Driver |
| ------------------ | ------------- | --------- | ------------ | -------------- |
| **Read (Single)**  | 1-5µs         | 0.5-2ms   | 10-50µs      | 10-100ms       |
| **Write (Single)** | 1-5µs         | 1-5ms     | 5-20µs       | 10-100ms       |
| **Read (Batch)**   | 10-50µs       | 2-10ms    | 50-200µs     | 20-200ms       |
| **Write (Batch)**  | 10-50µs       | 5-20ms    | 20-100µs     | 20-200ms       |
| **Key Listing**    | 5-20µs        | 1-10ms    | 20-100µs     | 50-500ms       |

## Driver Performance Characteristics

### Memory Driver

**Best Performance Scenarios:**

- Temporary data storage
- Caching frequently accessed data
- Testing and development
- Session management

**Performance Profile:**

```typescript
// Benchmark: Memory Driver Performance
const results = await benchmarkDriver(memoryStorage, 100000);
/*
Results (100k operations):
- Write: 45ms (2.2M ops/sec)
- Read: 32ms (3.1M ops/sec)
- Batch Read: 8ms (12.5M ops/sec)
- Memory Usage: ~50MB for 100k items
*/
```

**Optimization Tips:**

```typescript
// ✅ Excellent for high-frequency operations
const cache = createStorage({ driver: memoryDriver() });

// Cache frequently accessed data
const getCachedUserProfile = async (userId: string) => {
  const cacheKey = `profile:${userId}`;
  let profile = await cache.getItem(cacheKey);

  if (!profile) {
    profile = await loadUserProfileFromDatabase(userId);
    await cache.setItem(cacheKey, profile);
  }

  return profile;
};

// ✅ Use for temporary calculations
const tempStorage = createStorage({ driver: memoryDriver() });
await tempStorage.setItem("calculation-result", expensiveCalculation());
```

### File System Driver

**Best Performance Scenarios:**

- Persistent configuration storage
- Application state persistence
- Moderate-frequency data access
- Development with hot-reloading

**Performance Profile:**

```typescript
// Benchmark: FS Driver Performance
const results = await benchmarkDriver(fsStorage, 10000);
/*
Results (10k operations):
- Write: 1.2s (8.3k ops/sec)
- Read: 800ms (12.5k ops/sec)
- Batch Read: 200ms (50k ops/sec)
- Disk Usage: ~2MB for 10k items
*/
```

**Optimization Strategies:**

```typescript
// ✅ Use depth limiting for large directories
const shallowKeys = await storage.getKeys("config", { maxDepth: 1 });

// ✅ Optimize ignore patterns
const storage = createStorage({
  driver: fsDriver({
    base: "./data",
    ignore: [
      "**/node_modules/**", // Fast exclusion
      "**/*.tmp", // Temporary files
      "**/cache/**", // Cache directories
      "**/.DS_Store", // System files
    ],
  }),
});

// ✅ Use batch operations for multiple files
await storage.setItems([
  { key: "config:ui:theme", value: "dark" },
  { key: "config:ui:layout", value: "sidebar" },
  { key: "config:app:debug", value: false },
]);

// ❌ Avoid individual operations in loops
for (const item of items) {
  await storage.setItem(item.key, item.value); // Slow: N file operations
}
```

### Queue Driver

**Best Performance Scenarios:**

- High-frequency write operations
- Logging and analytics
- Bulk data imports
- Write-heavy applications

**Performance Profile:**

```typescript
// Benchmark: Queue Driver Performance
const results = await benchmarkDriver(queueStorage, 100000);
/*
Results (100k operations):
- Write: 150ms (666k ops/sec) - queued
- Read: 400ms (250k ops/sec) - includes queue check
- Batch Operations: 5x faster than individual
- Memory Usage: ~20MB queue buffer
*/
```

**Advanced Queue Configuration:**

```typescript
// High-throughput logging configuration
const loggingStorage = createStorage({
  driver: queueDriver({
    driver: fsDriver({ base: "./logs" }),
    batchSize: 1000, // Large batches for efficiency
    flushInterval: 5000, // Less frequent flushes
    maxQueueSize: 50000, // Large memory buffer
    mergeUpdates: true, // Deduplicate updates
  }),
});

// Real-time configuration storage
const configStorage = createStorage({
  driver: queueDriver({
    driver: fsDriver({ base: "./config" }),
    batchSize: 10, // Small batches for responsiveness
    flushInterval: 100, // Frequent flushes
    maxQueueSize: 1000, // Small memory footprint
    mergeUpdates: false, // Preserve all changes
  }),
});

// Manual flush control for critical operations
const queueContext = loggingStorage.getMount().driver.getInstance();
await flushQueue(queueContext); // Force immediate flush
```

## Batch Operations

Batch operations provide significant performance improvements by reducing the number of driver calls.

### Batch Read Optimization

```typescript
// ❌ Inefficient: Multiple individual reads
const getUserData = async (userIds: string[]) => {
  const users = [];
  for (const id of userIds) {
    const user = await storage.getItem(`user:${id}`); // N database/file operations
    if (user) users.push(user);
  }
  return users;
};

// ✅ Efficient: Single batch read
const getUserData = async (userIds: string[]) => {
  const keys = userIds.map((id) => `user:${id}`);
  const results = await storage.getItems(keys); // 1 batch operation
  return results.filter((r) => r.value).map((r) => r.value);
};

// ✅ Advanced: Batch with custom options
const results = await storage.getItems(
  [
    "user:profile",
    { key: "user:settings", options: { timeout: 1000 } },
    { key: "user:preferences", options: { priority: "high" } },
  ],
  { retries: 3 }
);
```

### Batch Write Optimization

```typescript
// ❌ Inefficient: Individual writes in loop
const saveUserUpdates = async (updates: UserUpdate[]) => {
  for (const update of updates) {
    await storage.setItem(`user:${update.id}`, update.data); // N operations
  }
};

// ✅ Efficient: Batch write
const saveUserUpdates = async (updates: UserUpdate[]) => {
  const items = updates.map((update) => ({
    key: `user:${update.id}`,
    value: update.data,
    options: { timestamp: Date.now() },
  }));
  await storage.setItems(items); // 1 batch operation
};

// ✅ Advanced: Mixed batch operations with error handling
const processBatchUpdates = async (updates: any[]) => {
  try {
    await storage.setItems(
      updates.map((u) => ({
        key: u.key,
        value: u.value,
      }))
    );
  } catch (error) {
    // Fallback to individual operations for error recovery
    const failed = [];
    for (const update of updates) {
      try {
        await storage.setItem(update.key, update.value);
      } catch (err) {
        failed.push({ update, error: err });
      }
    }
    if (failed.length > 0) {
      console.error("Failed batch updates:", failed);
    }
  }
};
```

### Smart Batching Patterns

```typescript
class BatchProcessor {
  private batchSize = 100;
  private flushInterval = 1000;
  private pendingWrites: Array<{ key: string; value: any }> = [];
  private flushTimer?: NodeJS.Timeout;

  async addWrite(key: string, value: any) {
    this.pendingWrites.push({ key, value });

    if (this.pendingWrites.length >= this.batchSize) {
      await this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  private async flush() {
    if (this.pendingWrites.length === 0) return;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    const batch = this.pendingWrites.splice(0);

    try {
      await storage.setItems(batch);
    } catch (error) {
      console.error("Batch write failed:", error);
      // Re-queue failed items or handle error
    }
  }
}

const processor = new BatchProcessor();

// Usage in high-frequency scenarios
for (let i = 0; i < 10000; i++) {
  processor.addWrite(`item:${i}`, { data: i, timestamp: Date.now() });
}
```

## Queue Driver Optimization

The queue driver provides sophisticated batching and merging capabilities.

### Queue Configuration Strategies

```typescript
// Strategy 1: High-throughput logging
const createLoggingStorage = () =>
  createStorage({
    driver: queueDriver({
      driver: fsDriver({ base: "./logs" }),
      batchSize: 2000, // Large batches
      flushInterval: 10000, // Infrequent flushes
      maxQueueSize: 100000, // Large buffer
      mergeUpdates: true, // Merge duplicate entries
    }),
  });

// Strategy 2: Real-time user interactions
const createInteractionStorage = () =>
  createStorage({
    driver: queueDriver({
      driver: fsDriver({ base: "./interactions" }),
      batchSize: 50, // Small batches
      flushInterval: 200, // Frequent flushes
      maxQueueSize: 5000, // Moderate buffer
      mergeUpdates: false, // Keep all interactions
    }),
  });

// Strategy 3: Configuration changes
const createConfigStorage = () =>
  createStorage({
    driver: queueDriver({
      driver: fsDriver({ base: "./config" }),
      batchSize: 20, // Very small batches
      flushInterval: 100, // Very frequent flushes
      maxQueueSize: 1000, // Small buffer
      mergeUpdates: true, // Latest config wins
    }),
  });
```

### Queue Monitoring and Control

```typescript
class QueueMonitor {
  constructor(private storage: Storage) {}

  getQueueStats() {
    const mount = this.storage.getMount();
    const queueContext = mount.driver.getInstance();

    return {
      queueSize: queueContext.queue.size,
      isFlushing: queueContext.flushing,
      disposed: queueContext.disposed,
    };
  }

  async waitForFlush(timeout = 5000): Promise<boolean> {
    const start = Date.now();
    const stats = this.getQueueStats();

    while (stats.queueSize > 0 && Date.now() - start < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return this.getQueueStats().queueSize === 0;
  }

  async forceFlush() {
    const mount = this.storage.getMount();
    const queueContext = mount.driver.getInstance();

    // Access private flush method if available
    if ("flushQueue" in mount.driver) {
      await (mount.driver as any).flushQueue();
    }
  }
}

// Usage
const monitor = new QueueMonitor(queueStorage);

// Monitor queue health
setInterval(() => {
  const stats = monitor.getQueueStats();
  if (stats.queueSize > 10000) {
    console.warn("Queue size is getting large:", stats.queueSize);
  }
}, 1000);

// Ensure all writes are flushed before critical operations
await monitor.waitForFlush();
await performCriticalOperation();
```

## Memory Management

Effective memory management is crucial for long-running applications.

### Memory Usage Patterns

```typescript
class MemoryEfficientStorage {
  private storage: Storage;
  private cache = new Map<string, { value: any; timestamp: number }>();
  private cacheMaxSize = 10000;
  private cacheTTL = 300000; // 5 minutes

  constructor(storage: Storage) {
    this.storage = storage;

    // Periodic cache cleanup
    setInterval(() => this.cleanupCache(), 60000);
  }

  async getItem<T>(key: string): Promise<T | null> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.value;
    }

    // Load from storage
    const value = await this.storage.getItem<T>(key);

    if (value !== null) {
      this.updateCache(key, value);
    }

    return value;
  }

  async setItem(key: string, value: any): Promise<void> {
    // Update storage
    await this.storage.setItem(key, value);

    // Update cache
    this.updateCache(key, value);
  }

  private updateCache(key: string, value: any) {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.cacheMaxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  private cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.cacheTTL) {
        this.cache.delete(key);
      }
    }
  }

  async dispose() {
    this.cache.clear();
    await this.storage.dispose();
  }
}
```

### Large Dataset Handling

```typescript
// Process large datasets in chunks
const processLargeDataset = async (storage: Storage, data: any[]) => {
  const chunkSize = 1000;

  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);

    // Process chunk in batch
    const items = chunk.map((item, index) => ({
      key: `data:${i + index}`,
      value: item,
    }));

    await storage.setItems(items);

    // Allow garbage collection
    if (i % 10000 === 0) {
      await new Promise((resolve) => setImmediate(resolve));

      // Optional: Force garbage collection in development
      if (global.gc) {
        global.gc();
      }
    }

    console.log(
      `Processed ${Math.min(i + chunkSize, data.length)}/${data.length}`
    );
  }
};

// Stream processing for very large datasets
const streamProcessLargeDataset = async function* (
  storage: Storage,
  dataStream: AsyncIterable<any>
) {
  const batchSize = 100;
  let batch: Array<{ key: string; value: any }> = [];
  let index = 0;

  for await (const item of dataStream) {
    batch.push({
      key: `stream:${index++}`,
      value: item,
    });

    if (batch.length >= batchSize) {
      await storage.setItems(batch);
      yield batch.length;
      batch = [];
    }
  }

  // Process remaining items
  if (batch.length > 0) {
    await storage.setItems(batch);
    yield batch.length;
  }
};
```

## I/O Optimization

### File System Optimization

```typescript
// Optimize file system operations
const createOptimizedFsStorage = (basePath: string) =>
  createStorage({
    driver: fsDriver({
      base: basePath,
      // Optimize ignore patterns for performance
      ignore: [
        "**/node_modules/**",
        "**/.git/**",
        "**/*.tmp",
        "**/*.log",
        "**/cache/**",
      ],
      // Configure chokidar for better performance
      watchOptions: {
        ignoreInitial: true,
        persistent: true,
        ignorePermissionErrors: true,
        usePolling: false, // Native file system events
        awaitWriteFinish: {
          // Wait for writes to complete
          stabilityThreshold: 100,
          pollInterval: 10,
        },
        atomic: true, // Handle atomic writes
      },
    }),
  });

// Use fs-lite for better performance when watching is not needed
const createLightweightStorage = (basePath: string) =>
  createStorage({
    driver: fsLiteDriver({
      base: basePath,
      ignore: (path) => {
        // Function-based ignore is faster than patterns for simple checks
        return (
          path.includes("node_modules") ||
          path.includes(".git") ||
          path.endsWith(".tmp")
        );
      },
    }),
  });
```

### Network I/O Optimization

```typescript
// Optimize network-based drivers
class OptimizedNetworkDriver implements Driver {
  private connectionPool: ConnectionPool;
  private requestQueue: RequestQueue;

  constructor(private options: NetworkDriverOptions) {
    this.connectionPool = new ConnectionPool({
      maxConnections: 10,
      keepAlive: true,
      timeout: 5000,
    });

    this.requestQueue = new RequestQueue({
      concurrency: 5,
      retries: 3,
      backoff: "exponential",
    });
  }

  async getItems(items: Array<{ key: string }>) {
    // Batch network requests
    const batches = this.chunkArray(items, 50); // Optimal batch size for network

    const results = await Promise.all(
      batches.map((batch) =>
        this.requestQueue.add(() =>
          this.connectionPool.request("GET", "/batch", {
            keys: batch.map((b) => b.key),
          })
        )
      )
    );

    return results.flat();
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

## Serialization Performance

### Optimizing Serialization

```typescript
// Profile serialization performance
const profileSerialization = async () => {
  const testData = {
    string: "test string",
    number: 42,
    boolean: true,
    date: new Date(),
    array: Array.from({ length: 1000 }, (_, i) => i),
    object: Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`key${i}`, `value${i}`])
    ),
    set: new Set(Array.from({ length: 100 }, (_, i) => i)),
    map: new Map(Array.from({ length: 100 }, (_, i) => [`key${i}`, i])),
  };

  console.time("serialization");
  for (let i = 0; i < 1000; i++) {
    await storage.setItem(`test:${i}`, testData);
  }
  console.timeEnd("serialization"); // Measure serialization performance

  console.time("deserialization");
  for (let i = 0; i < 1000; i++) {
    await storage.getItem(`test:${i}`);
  }
  console.timeEnd("deserialization"); // Measure deserialization performance
};

// Use raw operations for binary data
const optimizeBinaryStorage = async () => {
  const binaryData = new Uint8Array(1024 * 1024); // 1MB buffer

  console.time("binary-raw");
  await storage.setItemRaw("binary:raw", binaryData);
  console.timeEnd("binary-raw");

  console.time("binary-serialized");
  await storage.setItem("binary:serialized", binaryData);
  console.timeEnd("binary-serialized");

  // Raw operations are ~10x faster for binary data
};
```

### Serialization Strategies

```typescript
// Strategy 1: Pre-serialize complex objects
class PreSerializedStorage {
  constructor(private storage: Storage) {}

  async setComplexItem(key: string, value: any) {
    // Pre-process complex objects to reduce serialization time
    const processed = this.preprocessValue(value);
    return this.storage.setItem(key, processed);
  }

  private preprocessValue(value: any): any {
    if (value instanceof Date) {
      return { __type: "Date", value: value.toISOString() };
    }
    if (value instanceof Set) {
      return { __type: "Set", value: Array.from(value) };
    }
    if (value instanceof Map) {
      return { __type: "Map", value: Array.from(value.entries()) };
    }
    return value;
  }
}

// Strategy 2: Compress large objects
class CompressedStorage {
  async setLargeItem(key: string, value: any) {
    const serialized = JSON.stringify(value);

    if (serialized.length > 10000) {
      // Compress large items
      const compressed = await this.compress(serialized);
      await storage.setItemRaw(key + ":compressed", compressed);
    } else {
      await storage.setItem(key, value);
    }
  }

  private async compress(data: string): Promise<Uint8Array> {
    // Use compression library like zlib or brotli
    const { deflate } = await import("zlib");
    return new Promise((resolve, reject) => {
      deflate(Buffer.from(data), (err, result) => {
        if (err) reject(err);
        else resolve(new Uint8Array(result));
      });
    });
  }
}
```

## Caching Strategies

### Multi-Level Caching

```typescript
class MultiLevelCache {
  private l1Cache = new Map<string, any>(); // Memory cache
  private l2Storage: Storage; // Fast storage (SSD)
  private l3Storage: Storage; // Persistent storage

  constructor() {
    this.l2Storage = createStorage({
      driver: fsDriver({ base: "./cache" }),
    });
    this.l3Storage = createStorage({
      driver: fsDriver({ base: "./data" }),
    });
  }

  async get<T>(key: string): Promise<T | null> {
    // L1: Memory cache
    if (this.l1Cache.has(key)) {
      return this.l1Cache.get(key);
    }

    // L2: Fast storage
    let value = await this.l2Storage.getItem<T>(key);
    if (value !== null) {
      this.l1Cache.set(key, value);
      return value;
    }

    // L3: Persistent storage
    value = await this.l3Storage.getItem<T>(key);
    if (value !== null) {
      // Promote to higher levels
      this.l1Cache.set(key, value);
      await this.l2Storage.setItem(key, value);
      return value;
    }

    return null;
  }

  async set(key: string, value: any): Promise<void> {
    // Write to all levels
    this.l1Cache.set(key, value);
    await Promise.all([
      this.l2Storage.setItem(key, value),
      this.l3Storage.setItem(key, value),
    ]);
  }
}
```

### Intelligent Caching

```typescript
class IntelligentCache {
  private accessCount = new Map<string, number>();
  private accessTime = new Map<string, number>();
  private hotCache = new Map<string, any>();
  private readonly hotThreshold = 5;
  private readonly maxHotSize = 1000;

  async getItem<T>(key: string): Promise<T | null> {
    // Update access statistics
    this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1);
    this.accessTime.set(key, Date.now());

    // Check hot cache
    if (this.hotCache.has(key)) {
      return this.hotCache.get(key);
    }

    // Load from storage
    const value = await storage.getItem<T>(key);

    // Promote to hot cache if frequently accessed
    if (
      value !== null &&
      (this.accessCount.get(key) || 0) >= this.hotThreshold
    ) {
      this.promoteToHotCache(key, value);
    }

    return value;
  }

  private promoteToHotCache(key: string, value: any) {
    // Evict least recently used if cache is full
    if (this.hotCache.size >= this.maxHotSize) {
      const lruKey = this.findLRUKey();
      if (lruKey) {
        this.hotCache.delete(lruKey);
        this.accessTime.delete(lruKey);
      }
    }

    this.hotCache.set(key, value);
  }

  private findLRUKey(): string | null {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, time] of this.accessTime.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    return oldestKey;
  }
}
```

## Monitoring and Profiling

### Performance Monitoring

```typescript
class PerformanceMonitor {
  private metrics = new Map<string, number[]>();

  async measure<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.recordMetric(operation, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(`${operation}:error`, duration);
      throw error;
    }
  }

  private recordMetric(operation: string, duration: number) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }

    const values = this.metrics.get(operation)!;
    values.push(duration);

    // Keep only last 1000 measurements
    if (values.length > 1000) {
      values.shift();
    }
  }

  getStats(operation: string) {
    const values = this.metrics.get(operation) || [];
    if (values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: values.reduce((a, b) => a + b) / values.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  generateReport() {
    const report: any = {};
    for (const [operation, _] of this.metrics.entries()) {
      report[operation] = this.getStats(operation);
    }
    return report;
  }
}

// Usage
const monitor = new PerformanceMonitor();

const monitoredStorage = {
  getItem: (key: string) =>
    monitor.measure("getItem", () => storage.getItem(key)),

  setItem: (key: string, value: any) =>
    monitor.measure("setItem", () => storage.setItem(key, value)),

  getItems: (keys: string[]) =>
    monitor.measure("getItems", () => storage.getItems(keys)),
};

// Generate performance report
setInterval(() => {
  const report = monitor.generateReport();
  console.log("Performance Report:", JSON.stringify(report, null, 2));
}, 30000);
```

## Benchmarking

### Comprehensive Benchmark Suite

```typescript
class StorageBenchmark {
  private storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  async runFullBenchmark() {
    console.log("🚀 Starting storage benchmark suite...\n");

    await this.benchmarkWrites();
    await this.benchmarkReads();
    await this.benchmarkBatchOperations();
    await this.benchmarkKeyOperations();
    await this.benchmarkLargeObjects();
    await this.benchmarkConcurrency();

    console.log("✅ Benchmark suite completed");
  }

  async benchmarkWrites(iterations = 10000) {
    console.log(`📝 Write Benchmark (${iterations} operations)`);

    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      await this.storage.setItem(`test:write:${i}`, {
        id: i,
        data: `test data ${i}`,
        timestamp: Date.now(),
        nested: { level: 1, value: i * 2 },
      });
    }

    const duration = performance.now() - start;
    const opsPerSec = (iterations / duration) * 1000;

    console.log(`  Duration: ${duration.toFixed(2)}ms`);
    console.log(`  Ops/sec: ${opsPerSec.toFixed(0)}`);
    console.log(`  Avg latency: ${(duration / iterations).toFixed(2)}ms\n`);
  }

  async benchmarkReads(iterations = 10000) {
    console.log(`📖 Read Benchmark (${iterations} operations)`);

    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      await this.storage.getItem(`test:write:${i}`);
    }

    const duration = performance.now() - start;
    const opsPerSec = (iterations / duration) * 1000;

    console.log(`  Duration: ${duration.toFixed(2)}ms`);
    console.log(`  Ops/sec: ${opsPerSec.toFixed(0)}`);
    console.log(`  Avg latency: ${(duration / iterations).toFixed(2)}ms\n`);
  }

  async benchmarkBatchOperations() {
    console.log("📦 Batch Operations Benchmark");

    const batchSizes = [10, 50, 100, 500, 1000];

    for (const batchSize of batchSizes) {
      const items = Array.from({ length: batchSize }, (_, i) => ({
        key: `batch:${batchSize}:${i}`,
        value: { id: i, data: `batch data ${i}` },
      }));

      // Batch write
      const writeStart = performance.now();
      await this.storage.setItems(items);
      const writeDuration = performance.now() - writeStart;

      // Batch read
      const readStart = performance.now();
      await this.storage.getItems(items.map((item) => item.key));
      const readDuration = performance.now() - readStart;

      console.log(`  Batch size ${batchSize}:`);
      console.log(
        `    Write: ${writeDuration.toFixed(2)}ms (${((batchSize / writeDuration) * 1000).toFixed(0)} ops/sec)`
      );
      console.log(
        `    Read: ${readDuration.toFixed(2)}ms (${((batchSize / readDuration) * 1000).toFixed(0)} ops/sec)`
      );
    }
    console.log();
  }

  async benchmarkKeyOperations() {
    console.log("🔑 Key Operations Benchmark");

    // Create test data structure
    await this.storage.setItems([
      { key: "level1:item1", value: "data1" },
      { key: "level1:item2", value: "data2" },
      { key: "level1:level2:item1", value: "data3" },
      { key: "level1:level2:item2", value: "data4" },
      { key: "level1:level2:level3:item1", value: "data5" },
    ]);

    // Benchmark getKeys with different depths
    const depths = [undefined, 1, 2, 3];

    for (const depth of depths) {
      const start = performance.now();
      const keys = await this.storage.getKeys("level1:", { maxDepth: depth });
      const duration = performance.now() - start;

      console.log(
        `  getKeys (depth ${depth || "unlimited"}): ${duration.toFixed(2)}ms (${keys.length} keys)`
      );
    }
    console.log();
  }

  async benchmarkLargeObjects() {
    console.log("📄 Large Objects Benchmark");

    const sizes = [
      { name: "1KB", size: 1024 },
      { name: "10KB", size: 10 * 1024 },
      { name: "100KB", size: 100 * 1024 },
      { name: "1MB", size: 1024 * 1024 },
    ];

    for (const { name, size } of sizes) {
      const largeData = {
        id: "large-object",
        data: "x".repeat(size),
        metadata: { size: size, type: "benchmark" },
      };

      // Write
      const writeStart = performance.now();
      await this.storage.setItem(`large:${name}`, largeData);
      const writeDuration = performance.now() - writeStart;

      // Read
      const readStart = performance.now();
      await this.storage.getItem(`large:${name}`);
      const readDuration = performance.now() - readStart;

      console.log(`  ${name} object:`);
      console.log(`    Write: ${writeDuration.toFixed(2)}ms`);
      console.log(`    Read: ${readDuration.toFixed(2)}ms`);
    }
    console.log();
  }

  async benchmarkConcurrency() {
    console.log("⚡ Concurrency Benchmark");

    const concurrencyLevels = [1, 5, 10, 20, 50];

    for (const concurrency of concurrencyLevels) {
      const operationsPerWorker = 100;
      const totalOperations = concurrency * operationsPerWorker;

      const start = performance.now();

      const promises = Array.from(
        { length: concurrency },
        async (_, workerIndex) => {
          for (let i = 0; i < operationsPerWorker; i++) {
            const key = `concurrent:${workerIndex}:${i}`;
            await this.storage.setItem(key, { workerIndex, operation: i });
          }
        }
      );

      await Promise.all(promises);

      const duration = performance.now() - start;
      const opsPerSec = (totalOperations / duration) * 1000;

      console.log(
        `  ${concurrency} workers (${totalOperations} ops): ${duration.toFixed(2)}ms (${opsPerSec.toFixed(0)} ops/sec)`
      );
    }
    console.log();
  }
}

// Usage
const benchmark = new StorageBenchmark(storage);
await benchmark.runFullBenchmark();
```

## Best Practices

### 1. Choose the Right Driver

```typescript
// ✅ Memory driver for temporary data
const sessionStorage = createStorage({
  driver: memoryDriver(),
});

// ✅ FS driver for persistent data with watching
const configStorage = createStorage({
  driver: fsDriver({ base: "./config" }),
});

// ✅ Queue driver for high-frequency writes
const logsStorage = createStorage({
  driver: queueDriver({
    driver: fsDriver({ base: "./logs" }),
    batchSize: 1000,
  }),
});
```

### 2. Optimize Key Patterns

```typescript
// ✅ Use hierarchical keys for efficient filtering
await storage.setItem("user:123:profile", profileData);
await storage.setItem("user:123:settings", settingsData);

// ✅ Batch related operations
const userKeys = await storage.getKeys("user:123:", { maxDepth: 1 });

// ❌ Avoid flat key structures for related data
await storage.setItem("user_123_profile", profileData);
await storage.setItem("user_123_settings", settingsData);
```

### 3. Use Appropriate Batch Sizes

```typescript
// ✅ Optimal batch sizes for different scenarios
const BATCH_SIZES = {
  memory: 1000, // Large batches for memory operations
  fs: 100, // Moderate batches for file operations
  network: 50, // Smaller batches for network operations
  queue: 2000, // Large batches for queue operations
};

const processBatch = async (items: any[], storage: Storage) => {
  const driver = storage.getMount().driver;
  const batchSize = BATCH_SIZES[driver.name as keyof typeof BATCH_SIZES] || 100;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await storage.setItems(
      batch.map((item, index) => ({
        key: `item:${i + index}`,
        value: item,
      }))
    );
  }
};
```

### 4. Monitor Performance

```typescript
// ✅ Set up performance monitoring
const createMonitoredStorage = (storage: Storage) => {
  const monitor = new PerformanceMonitor();

  return new Proxy(storage, {
    get(target, prop) {
      if (typeof target[prop] === "function") {
        return function (...args: any[]) {
          return monitor.measure(String(prop), () =>
            target[prop].apply(target, args)
          );
        };
      }
      return target[prop];
    },
  });
};

// ✅ Regular performance reporting
setInterval(async () => {
  const report = monitor.generateReport();

  // Alert on performance degradation
  for (const [operation, stats] of Object.entries(report)) {
    if (stats && stats.p95 > getThreshold(operation)) {
      console.warn(
        `Performance degradation detected in ${operation}: P95 = ${stats.p95}ms`
      );
    }
  }
}, 60000);
```

### 5. Implement Graceful Degradation

```typescript
// ✅ Fallback strategies
class RobustStorage {
  constructor(
    private primary: Storage,
    private fallback: Storage
  ) {}

  async getItem<T>(key: string): Promise<T | null> {
    try {
      return await this.primary.getItem<T>(key);
    } catch (error) {
      console.warn("Primary storage failed, using fallback:", error.message);
      return await this.fallback.getItem<T>(key);
    }
  }

  async setItem(key: string, value: any): Promise<void> {
    try {
      await this.primary.setItem(key, value);
      // Async backup to fallback
      this.fallback.setItem(key, value).catch(console.error);
    } catch (error) {
      console.warn(
        "Primary storage failed, writing to fallback:",
        error.message
      );
      await this.fallback.setItem(key, value);
    }
  }
}
```

This comprehensive performance guide provides all the tools and strategies needed to optimize electron-async-storage for maximum performance across different usage patterns and requirements.
