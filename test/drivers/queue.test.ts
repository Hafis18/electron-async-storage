import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import memoryDriver from "../../src/drivers/memory";
import queueDriver from "../../src/drivers/queue";
import { createStorage } from "../../src";
import { testDriver } from "./utils";
import { stringify } from "../../src/_utils";

describe("drivers: queue", () => {
  testDriver({
    driver: () =>
      queueDriver({
        driver: memoryDriver(),
        batchSize: 3,
        flushInterval: 100,
        mergeUpdates: true,
      }),
  });

  describe("queue-specific functionality", () => {
    let storage: ReturnType<typeof createStorage>;
    let mockDriver: any;

    beforeEach(() => {
      vi.useFakeTimers();
      mockDriver = {
        hasItem: vi.fn(),
        getItem: vi.fn(),
        setItem: vi.fn(),
        setItems: vi.fn(),
        removeItem: vi.fn(),
        getKeys: vi.fn().mockResolvedValue([]),
        dispose: vi.fn(),
      };

      storage = createStorage({
        driver: queueDriver({
          driver: mockDriver,
          batchSize: 3,
          flushInterval: 1000,
          mergeUpdates: true,
        }),
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should buffer writes until batch size is reached", async () => {
      await storage.setItem("key1", "value1");
      await storage.setItem("key2", "value2");

      expect(mockDriver.setItem).not.toHaveBeenCalled();

      await storage.setItem("key3", "value3");

      // Should trigger flush due to batch size
      await vi.runAllTimersAsync();
      expect(mockDriver.setItems).toHaveBeenCalledWith([
        { key: "key1", value: stringify("value1"), options: {} },
        { key: "key2", value: stringify("value2"), options: {} },
        { key: "key3", value: stringify("value3"), options: {} },
      ]);
    });

    it("should flush on timer interval", async () => {
      await storage.setItem("key1", "value1");

      expect(mockDriver.setItem).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      expect(mockDriver.setItem).toHaveBeenCalledWith(
        "key1",
        stringify("value1"),
        {}
      );
    });

    it("should merge duplicate key updates", async () => {
      await storage.setItem("key1", "value1");
      await storage.setItem("key1", "value2");
      await storage.setItem("key1", "value3");

      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      expect(mockDriver.setItem).toHaveBeenCalledTimes(1);
      expect(mockDriver.setItem).toHaveBeenCalledWith(
        "key1",
        stringify("value3"),
        {}
      );
    });

    it("should handle mixed set and remove operations", async () => {
      await storage.setItem("key1", "value1");
      await storage.removeItem("key2");
      await storage.setItem("key3", "value3");

      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      // Check if batch operations were used or individual calls
      if (mockDriver.setItems.mock.calls.length > 0) {
        expect(mockDriver.setItems).toHaveBeenCalledWith([
          { key: "key1", value: stringify("value1"), options: {} },
          { key: "key3", value: stringify("value3"), options: {} },
        ]);
      } else {
        expect(mockDriver.setItem).toHaveBeenCalledWith(
          "key1",
          stringify("value1"),
          {}
        );
        expect(mockDriver.setItem).toHaveBeenCalledWith(
          "key3",
          stringify("value3"),
          {}
        );
      }
      expect(mockDriver.removeItem).toHaveBeenCalledWith("key2", {});
    });

    it("should return queued values from getItem", async () => {
      mockDriver.getItem.mockResolvedValue(null);

      await storage.setItem("key1", "queued_value");

      const value = await storage.getItem("key1");
      expect(value).toBe("queued_value");
      expect(mockDriver.getItem).not.toHaveBeenCalled();
    });

    it("should return null for removed keys in queue", async () => {
      mockDriver.getItem.mockResolvedValue("existing_value");

      await storage.removeItem("key1");

      const value = await storage.getItem("key1");
      expect(value).toBe(null);
      expect(mockDriver.getItem).not.toHaveBeenCalled();
    });

    it("should handle getItems with mixed queued and non-queued items", async () => {
      mockDriver.getItem.mockImplementation((key: string) => {
        if (key === "existing_key")
          return Promise.resolve(stringify("existing_value"));
        return Promise.resolve(null);
      });

      await storage.setItem("queued_key", "queued_value");

      const items = await storage.getItems([
        "queued_key",
        "existing_key",
        "missing_key",
      ]);

      expect(items).toEqual([
        { key: "queued_key", value: "queued_value" },
        { key: "existing_key", value: "existing_value" },
        { key: "missing_key", value: null },
      ]);
    });

    it("should flush all pending operations on dispose", async () => {
      await storage.setItem("key1", "value1");
      await storage.setItem("key2", "value2");

      await storage.dispose();

      // Check if batch operations were used or individual calls
      if (mockDriver.setItems.mock.calls.length > 0) {
        expect(mockDriver.setItems).toHaveBeenCalledWith([
          { key: "key1", value: stringify("value1"), options: {} },
          { key: "key2", value: stringify("value2"), options: {} },
        ]);
      } else {
        expect(mockDriver.setItem).toHaveBeenCalledWith(
          "key1",
          stringify("value1"),
          {}
        );
        expect(mockDriver.setItem).toHaveBeenCalledWith(
          "key2",
          stringify("value2"),
          {}
        );
      }
      expect(mockDriver.dispose).toHaveBeenCalled();
    });

    it("should respect maxQueueSize and force flush", async () => {
      const storage = createStorage({
        driver: queueDriver({
          driver: mockDriver,
          batchSize: 10,
          maxQueueSize: 2,
          flushInterval: 10_000,
        }),
      });

      await storage.setItem("key1", "value1");
      await storage.setItem("key2", "value2");

      expect(mockDriver.setItem).not.toHaveBeenCalled();

      await storage.setItem("key3", "value3"); // Should trigger maxQueueSize flush
      await vi.runAllTimersAsync();

      expect(mockDriver.setItem).toHaveBeenCalled();
    });

    it("should handle queue operations correctly with hasItem", async () => {
      mockDriver.hasItem.mockResolvedValue(false);

      expect(await storage.hasItem("key1")).toBe(false);

      await storage.setItem("key1", "value1");
      expect(await storage.hasItem("key1")).toBe(true);

      await storage.removeItem("key1");
      expect(await storage.hasItem("key1")).toBe(false);
    });

    it("should include queued keys in getKeys", async () => {
      mockDriver.getKeys.mockResolvedValue(["existing_key"]);

      await storage.setItem("queued_key", "value");
      await storage.removeItem("existing_key");

      const keys = await storage.getKeys();

      expect(keys).toEqual(["queued_key"]);
    });
  });
});
