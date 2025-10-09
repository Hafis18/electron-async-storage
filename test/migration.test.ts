import { describe, it, expect, beforeEach } from "vitest";
import { createStorage } from "../src";
import memory from "../src/drivers/memory";
import fs from "../src/drivers/fs";
import queue from "../src/drivers/queue";
import { resolve } from "node:path";
import { rmSync, existsSync } from "node:fs";

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

  it("should be able to read keys with getKeysSync after migration", async () => {
    const STORAGES = {
      APP_THEME_STATE: "app:theme:state",
      APP_WINDOWS: (id: string) => `app:windows:${id}`,
      APP_I18N_LOCALE: "app:i18n:locale",
    };

    storage = createStorage({
      driver: memory(),
      version: 1,
      migrations: {
        1: async (s) => {
          // init theme state
          const currentThemeState = await s.getItem(STORAGES.APP_THEME_STATE);
          if (currentThemeState == null) {
            await s.setItem(STORAGES.APP_THEME_STATE, {
              theme: "system",
              shouldUseDarkColors: false,
            });
          }

          // init main window state
          const mainWindowState = await s.getItem(STORAGES.APP_WINDOWS("main"));
          if (mainWindowState == null) {
            await s.setItem(STORAGES.APP_WINDOWS("main"), {
              type: "main",
              windowId: "main",
              tabs: [
                {
                  id: "welcome-tab",
                  isActive: true,
                  name: "Welcome",
                  pinned: false,
                  url: "/welcome",
                },
              ],
            });
          }

          // init locale state
          const localeState = await s.getItem(STORAGES.APP_I18N_LOCALE);
          if (localeState == null) {
            await s.setItem(STORAGES.APP_I18N_LOCALE, "en");
          }
        },
      },
    });

    await storage.migrate();

    // Test getKeysSync can read the key set during migration
    const windowKeys = storage.getKeysSync("app:windows");
    expect(windowKeys).toHaveLength(1);
    expect(windowKeys).toContain("app:windows:main");

    // Verify the data is actually there
    const mainWindowState = await storage.getItem("app:windows:main");
    expect(mainWindowState).toBeDefined();
    expect(mainWindowState).toHaveProperty("windowId", "main");
    expect(mainWindowState).toHaveProperty("tabs");
    expect((mainWindowState as any).tabs).toHaveLength(1);
  });

  it("should be able to read keys with getKeysSync after migration (with fs driver)", async () => {
    const dir = resolve(__dirname, "tmp/migration-fs");

    // Clean up before test
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }

    const STORAGES = {
      APP_THEME_STATE: "app:theme:state",
      APP_WINDOWS: (id: string) => `app:windows:${id}`,
      APP_I18N_LOCALE: "app:i18n:locale",
    };

    storage = createStorage({
      driver: fs({ base: dir }),
      version: 1,
      migrations: {
        1: async (s) => {
          // init theme state
          const currentThemeState = await s.getItem(STORAGES.APP_THEME_STATE);
          if (currentThemeState == null) {
            await s.setItem(STORAGES.APP_THEME_STATE, {
              theme: "system",
              shouldUseDarkColors: false,
            });
          }

          // init main window state
          const mainWindowState = await s.getItem(STORAGES.APP_WINDOWS("main"));
          if (mainWindowState == null) {
            await s.setItem(STORAGES.APP_WINDOWS("main"), {
              type: "main",
              windowId: "main",
              tabs: [
                {
                  id: "welcome-tab",
                  isActive: true,
                  name: "Welcome",
                  pinned: false,
                  url: "/welcome",
                },
              ],
            });
          }

          // init locale state
          const localeState = await s.getItem(STORAGES.APP_I18N_LOCALE);
          if (localeState == null) {
            await s.setItem(STORAGES.APP_I18N_LOCALE, "en");
          }
        },
      },
    });

    await storage.migrate();

    // Test getKeysSync can read the key set during migration
    const windowKeys = storage.getKeysSync("app:windows");
    expect(windowKeys).toHaveLength(1);
    expect(windowKeys).toContain("app:windows:main");

    // Verify the data is actually there
    const mainWindowState = await storage.getItem("app:windows:main");
    expect(mainWindowState).toBeDefined();
    expect(mainWindowState).toHaveProperty("windowId", "main");
    expect(mainWindowState).toHaveProperty("tabs");
    expect((mainWindowState as any).tabs).toHaveLength(1);

    // Clean up after test
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("should be able to read keys with getKeysSync after migration (with queue + fs driver)", async () => {
    const dir = resolve(__dirname, "tmp/migration-queue-fs");

    // Clean up before test
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }

    const STORAGES = {
      APP_THEME_STATE: "app:theme:state",
      APP_WINDOWS: (id: string) => `app:windows:${id}`,
      APP_I18N_LOCALE: "app:i18n:locale",
    };

    storage = createStorage({
      driver: queue({
        batchSize: 3,
        flushInterval: 1000,
        maxQueueSize: 1000,
        mergeUpdates: true,
        driver: fs({ base: dir }),
      }),
      version: 1,
      migrations: {
        1: async (s) => {
          // init theme state
          const currentThemeState = await s.getItem(STORAGES.APP_THEME_STATE);
          if (currentThemeState == null) {
            await s.setItem(STORAGES.APP_THEME_STATE, {
              theme: "system",
              shouldUseDarkColors: false,
            });
          }

          // init main window state
          const mainWindowState = await s.getItem(STORAGES.APP_WINDOWS("main"));
          if (mainWindowState == null) {
            await s.setItem(STORAGES.APP_WINDOWS("main"), {
              type: "main",
              windowId: "main",
              tabs: [
                {
                  id: "welcome-tab",
                  isActive: true,
                  name: "Welcome",
                  pinned: false,
                  url: "/welcome",
                },
              ],
            });
          }

          // init locale state
          const localeState = await s.getItem(STORAGES.APP_I18N_LOCALE);
          if (localeState == null) {
            await s.setItem(STORAGES.APP_I18N_LOCALE, "en");
          }
        },
      },
    });

    await storage.migrate();

    // Flush queue to ensure all operations are written to fs
    await storage.flush();

    // Test getKeysSync can read the key set during migration
    const windowKeys = storage.getKeysSync("app:windows");
    expect(windowKeys).toHaveLength(1);
    expect(windowKeys).toContain("app:windows:main");

    // Verify the data is actually there
    const mainWindowState = await storage.getItem("app:windows:main");
    expect(mainWindowState).toBeDefined();
    expect(mainWindowState).toHaveProperty("windowId", "main");
    expect(mainWindowState).toHaveProperty("tabs");
    expect((mainWindowState as any).tabs).toHaveLength(1);

    // Clean up after test
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
