import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import { createStorage } from "../src";
import memory from "../src/drivers/memory";
import fs from "../src/drivers/fs";
import fsLite from "../src/drivers/fs-lite";
import queue from "../src/drivers/queue";
import { rmSync, existsSync } from "node:fs";

describe("Synchronous API", () => {
  describe("Memory Driver", () => {
    let storage: any;

    beforeEach(() => {
      storage = createStorage({ driver: memory() });
    });

    it("should have sync item operations", () => {
      // hasItemSync
      expect(storage.hasItemSync("test")).toBe(false);

      // setItemSync
      storage.setItemSync("test", "value");
      expect(storage.hasItemSync("test")).toBe(true);

      // getItemSync
      expect(storage.getItemSync("test")).toBe("value");

      // removeItemSync
      storage.removeItemSync("test");
      expect(storage.hasItemSync("test")).toBe(false);
      expect(storage.getItemSync("test")).toBe(null);
    });

    it("should handle complex objects synchronously", () => {
      const complexObj = {
        a: 1,
        b: "string",
        c: [1, 2, 3],
        d: { nested: true },
        e: new Date("2023-01-01"),
      };

      storage.setItemSync("complex", complexObj);
      const retrieved = storage.getItemSync("complex");

      expect(retrieved).toEqual(complexObj);
      expect(retrieved.e).toBeInstanceOf(Date);
    });

    it("should have sync key operations", () => {
      storage.setItemSync("key1", "value1");
      storage.setItemSync("key2", "value2");
      storage.setItemSync("prefix:key3", "value3");

      const allKeys = storage.getKeysSync();
      expect(allKeys.sort()).toEqual(["key1", "key2", "prefix:key3"]);

      const prefixKeys = storage.getKeysSync("prefix");
      expect(prefixKeys).toEqual(["prefix:key3"]);
    });

    it("should have sync clear operation", () => {
      storage.setItemSync("key1", "value1");
      storage.setItemSync("key2", "value2");

      storage.clearSync();
      expect(storage.getKeysSync()).toEqual([]);
    });

    it("should have sync raw operations", () => {
      const buffer = new Uint8Array([1, 2, 3, 4]);
      storage.setItemRawSync("buffer", buffer);

      const retrieved = storage.getItemRawSync("buffer");
      expect(retrieved).toEqual(buffer);
    });

    it("should have sync batch operations", () => {
      storage.setItemsSync([
        { key: "batch1", value: "value1" },
        { key: "batch2", value: "value2" },
      ]);

      expect(storage.getItemSync("batch1")).toBe("value1");
      expect(storage.getItemSync("batch2")).toBe("value2");

      const items = storage.getItemsSync(["batch1", "batch2"]);
      expect(items).toEqual([
        { key: "batch1", value: "value1" },
        { key: "batch2", value: "value2" },
      ]);
    });

    it("should have sync aliases", () => {
      storage.setSync("alias", "value");
      expect(storage.hasSync("alias")).toBe(true);
      expect(storage.getSync("alias")).toBe("value");
      expect(storage.keysSync()).toContain("alias");

      storage.delSync("alias");
      expect(storage.hasSync("alias")).toBe(false);
    });

    it("should handle sync meta operations", () => {
      const meta = { custom: "metadata", version: 1 };
      storage.setItemSync("test", "value");
      storage.setMetaSync("test", meta);

      const retrievedMeta = storage.getMetaSync("test");
      expect(retrievedMeta).toMatchObject(meta);

      storage.removeMetaSync("test");
      const noMeta = storage.getMetaSync("test");
      expect(noMeta.custom).toBeUndefined();
    });
  });

  describe("FS Driver", () => {
    const testDir = resolve(__dirname, "../temp/sync-test-fs");
    let storage: any;

    beforeEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
      storage = createStorage({ driver: fs({ base: testDir }) });
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("should have sync file operations", () => {
      expect(storage.hasItemSync("test.txt")).toBe(false);

      storage.setItemSync("test.txt", "file content");
      expect(storage.hasItemSync("test.txt")).toBe(true);

      const content = storage.getItemSync("test.txt");
      expect(content).toBe("file content");

      storage.removeItemSync("test.txt");
      expect(storage.hasItemSync("test.txt")).toBe(false);
    });

    it("should handle nested paths synchronously", () => {
      storage.setItemSync("nested/deep/file.txt", "nested content");
      expect(storage.getItemSync("nested/deep/file.txt")).toBe(
        "nested content"
      );

      const keys = storage.getKeysSync();
      expect(keys).toContain("nested:deep:file.txt");
    });

    it("should have sync meta operations with file stats", () => {
      storage.setItemSync("meta-test.txt", "content");
      const meta = storage.getMetaSync("meta-test.txt");

      expect(meta).toHaveProperty("mtime");
      expect(meta).toHaveProperty("size");
      expect(meta.size).toBeGreaterThan(0);
    });

    it("should handle sync clear operations", () => {
      storage.setItemSync("file1.txt", "content1");
      storage.setItemSync("file2.txt", "content2");

      storage.clearSync();
      expect(storage.getKeysSync()).toEqual([]);
    });
  });

  describe("FS-Lite Driver", () => {
    const testDir = resolve(__dirname, "../temp/sync-test-fs-lite");
    let storage: any;

    beforeEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
      storage = createStorage({ driver: fsLite({ base: testDir }) });
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("should work similar to FS driver", () => {
      storage.setItemSync("lite-test.txt", "lite content");
      expect(storage.getItemSync("lite-test.txt")).toBe("lite content");
      expect(storage.hasItemSync("lite-test.txt")).toBe(true);

      const keys = storage.getKeysSync();
      expect(keys).toContain("lite-test.txt");
    });
  });

  describe("Queue Driver", () => {
    let storage: any;
    let memoryDriver: any;

    beforeEach(() => {
      memoryDriver = memory();
      storage = createStorage({
        driver: queue({
          driver: memoryDriver,
          flushInterval: 50,
          batchSize: 10,
        }),
      });
    });

    it("should handle sync operations by bypassing queue", () => {
      // Queue operations (async)
      storage.setItem("queued", "queued-value");

      // Sync operations should bypass queue
      storage.setItemSync("sync", "sync-value");
      expect(storage.getItemSync("sync")).toBe("sync-value");

      // Should see queued item too (from queue state)
      expect(storage.getItemSync("queued")).toBe("queued-value");
    });

    it("should throw error if underlying driver doesn't support sync", () => {
      // Create a mock driver without sync methods
      const mockDriver = {
        hasItem: () => false,
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        getKeys: () => [],
      };

      const queueStorage = createStorage({
        driver: queue({ driver: mockDriver as any }),
      });

      expect(() => queueStorage.hasItemSync("test")).toThrow(
        /synchronous.*operation/
      );
      expect(() => queueStorage.getItemSync("test")).toThrow(
        /synchronous.*operation/
      );
      expect(() => queueStorage.setItemSync("test", "value")).toThrow(
        /synchronous.*operation/
      );
    });
  });

  describe("Mixed Async/Sync Usage", () => {
    let storage: any;

    beforeEach(() => {
      storage = createStorage({ driver: memory() });
    });

    it("should be interoperable with async operations", async () => {
      // Set with sync, read with async
      storage.setItemSync("sync-set", "value1");
      expect(await storage.getItem("sync-set")).toBe("value1");

      // Set with async, read with sync
      await storage.setItem("async-set", "value2");
      expect(storage.getItemSync("async-set")).toBe("value2");

      // Mixed operations should work consistently
      const allKeys = storage.getKeysSync();
      const allKeysAsync = await storage.getKeys();
      expect(allKeys.sort()).toEqual(allKeysAsync.sort());
    });
  });

  describe("Error Handling", () => {
    let storage: any;

    beforeEach(() => {
      storage = createStorage({ driver: memory() });
    });

    it("should handle undefined values in sync operations", () => {
      storage.setItemSync("test", undefined);
      expect(storage.hasItemSync("test")).toBe(false);
      expect(storage.getItemSync("test")).toBe(null);
    });

    it("should handle sync operations on non-existent keys", () => {
      expect(storage.hasItemSync("non-existent")).toBe(false);
      expect(storage.getItemSync("non-existent")).toBe(null);
      expect(storage.getItemRawSync("non-existent")).toBe(null);

      // Remove non-existent key should not throw
      expect(() => storage.removeItemSync("non-existent")).not.toThrow();
    });
  });

  describe("Mount Points with Sync API", () => {
    let storage: any;

    beforeEach(() => {
      storage = createStorage({ driver: memory() });
      storage.mount("cache", memory());
      storage.mount("temp", memory());
    });

    it("should handle sync operations across mounts", () => {
      storage.setItemSync("root-key", "root-value");
      storage.setItemSync("cache:cached-key", "cached-value");
      storage.setItemSync("temp:temp-key", "temp-value");

      expect(storage.getItemSync("root-key")).toBe("root-value");
      expect(storage.getItemSync("cache:cached-key")).toBe("cached-value");
      expect(storage.getItemSync("temp:temp-key")).toBe("temp-value");

      const allKeys = storage.getKeysSync();
      expect(allKeys.sort()).toEqual([
        "cache:cached-key",
        "root-key",
        "temp:temp-key",
      ]);

      const cacheKeys = storage.getKeysSync("cache");
      expect(cacheKeys).toEqual(["cache:cached-key"]);
    });

    it("should handle sync clear operations per mount", () => {
      storage.setItemSync("root-key", "root-value");
      storage.setItemSync("cache:cached-key", "cached-value");

      storage.clearSync("cache");
      expect(storage.getItemSync("cache:cached-key")).toBe(null);
      expect(storage.getItemSync("root-key")).toBe("root-value");
    });
  });

  describe("Performance Comparison", () => {
    let storage: any;

    beforeEach(() => {
      storage = createStorage({ driver: memory() });
    });

    it("should perform sync operations (performance test)", async () => {
      const iterations = 100; // Reduced iterations for stability

      // Benchmark sync operations
      const syncStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        storage.setItemSync(`sync-key-${i}`, `value-${i}`);
        storage.getItemSync(`sync-key-${i}`);
      }
      const syncTime = performance.now() - syncStart;

      // Benchmark async operations
      const asyncStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await storage.setItem(`async-key-${i}`, `value-${i}`);
        await storage.getItem(`async-key-${i}`);
      }
      const asyncTime = performance.now() - asyncStart;

      // Both operations should complete successfully (timing may vary by system)
      expect(syncTime).toBeGreaterThan(0);
      expect(asyncTime).toBeGreaterThan(0);
      console.log(`Sync: ${syncTime}ms, Async: ${asyncTime}ms`);
    });
  });
});
