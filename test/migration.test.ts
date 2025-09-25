import { describe, it, expect, beforeEach } from "vitest";
import { createStorage } from "../src";
import memory from "../src/drivers/memory";

describe("storage migration", () => {
  let storage: any;

  beforeEach(() => {
    storage = null;
  });

  it("should set initial version when no migrations exist", async () => {
    storage = createStorage({
      driver: memory(),
      version: 1,
      migrations: {},
    });

    await storage.migrate();
    const version = await storage.getStorageVersion();
    expect(version).toBe(1);
  });

  it("should run migrations in sequence", async () => {
    const migrationLog: number[] = [];

    storage = createStorage({
      driver: memory(),
      version: 3,
      migrations: {
        1: async (storage) => {
          migrationLog.push(1);
          await storage.setItem("test:v1", "migration1");
        },
        2: async (storage) => {
          migrationLog.push(2);
          await storage.setItem("test:v2", "migration2");
        },
        3: async (storage) => {
          migrationLog.push(3);
          await storage.setItem("test:v3", "migration3");
        },
      },
    });

    await storage.migrate();

    expect(migrationLog).toEqual([1, 2, 3]);
    expect(await storage.getItem("test:v1")).toBe("migration1");
    expect(await storage.getItem("test:v2")).toBe("migration2");
    expect(await storage.getItem("test:v3")).toBe("migration3");
    expect(await storage.getStorageVersion()).toBe(3);
  });

  it("should skip migrations if current version is higher", async () => {
    storage = createStorage({
      driver: memory(),
      version: 2,
      migrations: {
        3: async () => {
          throw new Error("Should not run");
        },
      },
    });

    // Set current version to 3
    await storage.setItem("__storage_version__", 3);

    await storage.migrate(); // Should not throw
    expect(await storage.getStorageVersion()).toBe(3);
  });

  it("should run only missing migrations", async () => {
    const migrationLog: number[] = [];

    storage = createStorage({
      driver: memory(),
      version: 4,
      migrations: {
        1: () => {
          migrationLog.push(1);
        },
        2: () => {
          migrationLog.push(2);
        },
        3: () => {
          migrationLog.push(3);
        },
        4: () => {
          migrationLog.push(4);
        },
      },
    });

    // Set current version to 2
    await storage.setItem("__storage_version__", 2);

    await storage.migrate();

    expect(migrationLog).toEqual([3, 4]);
    expect(await storage.getStorageVersion()).toBe(4);
  });

  it("should call migration hooks", async () => {
    const hooksCalled: string[] = [];

    storage = createStorage({
      driver: memory(),
      version: 2,
      migrations: {
        1: () => {},
        2: () => {},
      },
      migrationHooks: {
        beforeMigration: (from, to) => {
          hooksCalled.push(`before:${from}->${to}`);
        },
        afterMigration: (from, to) => {
          hooksCalled.push(`after:${from}->${to}`);
        },
      },
    });

    await storage.migrate();

    expect(hooksCalled).toEqual(["before:0->2", "after:0->2"]);
  });

  it("should handle migration errors", async () => {
    const hooksCalled: string[] = [];

    storage = createStorage({
      driver: memory(),
      version: 2,
      migrations: {
        1: () => {},
        2: () => {
          throw new Error("Migration failed");
        },
      },
      migrationHooks: {
        onMigrationError: (error, from, to) => {
          hooksCalled.push(`error:${error.message}:${from}->${to}`);
        },
      },
    });

    await expect(storage.migrate()).rejects.toThrow("Migration failed");
    expect(hooksCalled).toContain("error:Migration failed:0->2");
  });

  it("should handle data transformation migrations", async () => {
    storage = createStorage({
      driver: memory(),
      version: 2,
      migrations: {
        1: async (storage) => {
          // Initial data setup
          await storage.setItem("user:1", { name: "John", age: 30 });
          await storage.setItem("user:2", { name: "Jane", age: 25 });
        },
        2: async (storage) => {
          // Transform data: add email field
          const keys = await storage.getKeys("user:");
          for (const key of keys) {
            const user = await storage.getItem(key);
            if (user && typeof user === "object" && "name" in user) {
              await storage.setItem(key, {
                ...user,
                email: `${(user as any).name.toLowerCase()}@example.com`,
              });
            }
          }
        },
      },
    });

    await storage.migrate();

    const user1 = await storage.getItem("user:1");
    const user2 = await storage.getItem("user:2");

    expect(user1).toEqual({
      name: "John",
      age: 30,
      email: "john@example.com",
    });

    expect(user2).toEqual({
      name: "Jane",
      age: 25,
      email: "jane@example.com",
    });
  });
});
