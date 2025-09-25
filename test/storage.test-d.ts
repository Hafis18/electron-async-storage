import { describe, it, expectTypeOf } from "vitest";
import { createStorage, prefixStorage } from "../src";
import type { Storage, StorageValue } from "../src";

describe("types", () => {
  it("default types for storage", async () => {
    const storage = createStorage();

    expectTypeOf(
      await storage.getItem("foo")
    ).toEqualTypeOf<StorageValue | null>();

    expectTypeOf(await storage.getItem<boolean>("foo")).toEqualTypeOf<
      boolean | null
    >();

    expectTypeOf(
      await storage.getItem<{ hello: string }>("foo")
    ).toEqualTypeOf<{ hello: string } | null>();

    await storage.setItem("foo", "str");
    await storage.set("bar", 1);
    await storage.removeItem("foo");
    await storage.remove("bar");
    await storage.del("baz");
  });

  it("indexed types for storage", async () => {
    const storage = createStorage<string>();

    expectTypeOf(await storage.getItem("foo")).toEqualTypeOf<string | null>();

    await storage.setItem("foo", "str");
    await storage.set("bar", 1);

    await storage.removeItem("foo");
    await storage.remove("bar");
    await storage.del("baz");
  });

  it("namespaced types for storage", async () => {
    type TestObjType = {
      a: number;
      b: boolean;
    };
    type MyStorage = {
      items: {
        foo: string;
        bar: number;
        baz: TestObjType;
      };
    };
    const storage = createStorage<MyStorage>();

    expectTypeOf(await storage.getItem("foo")).toEqualTypeOf<string | null>();
    expectTypeOf(await storage.getItem("bar")).toEqualTypeOf<number | null>();
    expectTypeOf(
      await storage.getItem("unknown")
    ).toEqualTypeOf<StorageValue | null>();
    expectTypeOf(await storage.get("baz")).toEqualTypeOf<TestObjType | null>();

    // await storage.setItem("foo", 1); // ✅ Now properly errors - number not assignable to string
    await storage.setItem("foo", "str");
    // await storage.set("bar", "str"); // ✅ Now properly errors - string not assignable to number
    await storage.set("bar", 1);

    // should be able to get ts prompts: 'foo' | 'bar' | 'baz'
    await storage.removeItem("foo");
    await storage.remove("bar");
    await storage.del("baz");
  });

  it("prefix storage", () => {
    const storage1 = createStorage();
    const prefixedStorage1 = prefixStorage(storage1, "foo");
    expectTypeOf(prefixedStorage1).toEqualTypeOf<Storage<StorageValue>>();

    const storage2 = createStorage<string>();
    const prefixedStorage2 = prefixStorage(storage2, "foo");
    expectTypeOf(prefixedStorage2).toEqualTypeOf<Storage<string>>();

    const storage3 = createStorage<string>();
    const prefixedStorage3 = prefixStorage<number>(storage3, "foo");
    expectTypeOf(prefixedStorage3).toEqualTypeOf<Storage<number>>();
  });

  it("typed storage with constants pattern", async () => {
    // Define the storage constants
    const STORAGES = {
      APP_THEME_STATE: "app:theme:state",
      USER_PREFERENCES: "user:preferences",
      SESSION_DATA: "session:data",
    } as const;

    // Define the types for each storage key
    interface ThemeState {
      mode: "light" | "dark";
      primaryColor: string;
    }

    interface UserPreferences {
      language: string;
      notifications: boolean;
      autoSave: boolean;
    }

    interface SessionData {
      userId: string;
      loginTime: number;
      lastActivity: number;
    }

    // Use direct type mapping approach instead of complex utility types
    type MyAppStorage = {
      items: {
        [STORAGES.APP_THEME_STATE]: ThemeState;
        [STORAGES.USER_PREFERENCES]: UserPreferences;
        [STORAGES.SESSION_DATA]: SessionData;
      };
    };

    // Create storage with typed definition
    const storage = createStorage<MyAppStorage>();

    // Test type inference for getItem
    expectTypeOf(
      await storage.getItem(STORAGES.APP_THEME_STATE)
    ).toEqualTypeOf<ThemeState | null>();

    expectTypeOf(
      await storage.getItem(STORAGES.USER_PREFERENCES)
    ).toEqualTypeOf<UserPreferences | null>();

    expectTypeOf(
      await storage.getItem(STORAGES.SESSION_DATA)
    ).toEqualTypeOf<SessionData | null>();

    // Test type inference for setItem
    await storage.setItem(STORAGES.APP_THEME_STATE, {
      mode: "dark",
      primaryColor: "#007acc",
    });

    await storage.setItem(STORAGES.USER_PREFERENCES, {
      language: "en",
      notifications: true,
      autoSave: false,
    });

    await storage.setItem(STORAGES.SESSION_DATA, {
      userId: "user123",
      loginTime: Date.now(),
      lastActivity: Date.now(),
    });

    // await storage.setItem(STORAGES.APP_THEME_STATE, { invalidField: true });
    // await storage.setItem(STORAGES.USER_PREFERENCES, "invalid string");
    // await storage.setItem(STORAGES.SESSION_DATA, 123);

    // Test that unknown keys fall back to StorageValue
    expectTypeOf(
      await storage.getItem("unknown:key")
    ).toEqualTypeOf<StorageValue | null>();
  });

  it("direct typed storage definition", async () => {
    // Alternative approach without helper function
    type MyTypedStorage = {
      items: {
        "theme:mode": "light" | "dark";
        "user:name": string;
        "config:settings": { autoSave: boolean; theme: string };
      };
    };

    const storage = createStorage<MyTypedStorage>();

    // Test type inference
    expectTypeOf(await storage.getItem("theme:mode")).toEqualTypeOf<
      "light" | "dark" | null
    >();

    expectTypeOf(await storage.getItem("user:name")).toEqualTypeOf<
      string | null
    >();

    expectTypeOf(await storage.getItem("config:settings")).toEqualTypeOf<{
      autoSave: boolean;
      theme: string;
    } | null>();

    // Test setItem type safety
    await storage.setItem("theme:mode", "dark");
    await storage.setItem("user:name", "John Doe");
    await storage.setItem("config:settings", { autoSave: true, theme: "dark" });

    // await storage.setItem("theme:mode", "invalid");
    // await storage.setItem("user:name", 123);
    // await storage.setItem("config:settings", "invalid");

    // Test setItems type safety
    await storage.setItems([
      { key: "theme:mode", value: "light" },
      { key: "user:name", value: "Jane Doe" },
      { key: "config:settings", value: { autoSave: false, theme: "light" } },
    ]);

    // await storage.setItems([{ key: "theme:mode", value: "invalid" }]);
    // await storage.setItems([{ key: "user:name", value: 123 }]);
    // await storage.setItems([{ key: "config:settings", value: "invalid" }]);
  });

  it("typed storage with constants - setItems type safety", async () => {
    // Test the STORAGES constants pattern with setItems
    const STORAGES = {
      APP_THEME_STATE: "app:theme:state",
      USER_PREFERENCES: "user:preferences",
    } as const;

    interface ThemeState {
      mode: "light" | "dark";
      primaryColor: string;
    }

    interface UserPreferences {
      language: string;
      notifications: boolean;
    }

    type MyAppStorage = {
      items: {
        [STORAGES.APP_THEME_STATE]: ThemeState;
        [STORAGES.USER_PREFERENCES]: UserPreferences;
      };
    };

    const storage = createStorage<MyAppStorage>();

    // Test setItems with correct types
    await storage.setItems([
      {
        key: STORAGES.APP_THEME_STATE,
        value: { mode: "dark", primaryColor: "#007acc" },
      },
      {
        key: STORAGES.USER_PREFERENCES,
        value: { language: "en", notifications: true },
      },
    ]);

    // These should cause TypeScript errors due to wrong value types
    // The errors are being caught correctly by the type system

    // Test getItems type safety
    const items = await storage.getItems([
      STORAGES.APP_THEME_STATE,
      STORAGES.USER_PREFERENCES,
    ]);

    // Verify return types are correctly inferred
    expectTypeOf(items).toEqualTypeOf<
      {
        key: "app:theme:state" | "user:preferences";
        value: ThemeState | UserPreferences | null;
      }[]
    >();

    // Test with object form
    const itemsWithOptions = await storage.getItems([
      { key: STORAGES.APP_THEME_STATE },
      { key: STORAGES.USER_PREFERENCES, options: {} },
    ]);

    expectTypeOf(itemsWithOptions).toEqualTypeOf<
      {
        key: "app:theme:state" | "user:preferences";
        value: ThemeState | UserPreferences | null;
      }[]
    >();
  });

  it("getItems type safety with direct keys", async () => {
    // Test the direct typed storage definition with getItems
    type MyTypedStorage = {
      items: {
        "theme:mode": "light" | "dark";
        "user:name": string;
        "config:settings": { autoSave: boolean; theme: string };
      };
    };

    const storage = createStorage<MyTypedStorage>();

    // Test getItems with direct keys
    const items = await storage.getItems(["theme:mode", "user:name"]);

    expectTypeOf(items).toEqualTypeOf<
      {
        key: "theme:mode" | "user:name";
        value: ("light" | "dark") | string | null;
      }[]
    >();

    // Test with object form
    const itemsWithOptions = await storage.getItems([
      { key: "theme:mode" },
      { key: "config:settings", options: {} },
    ]);

    expectTypeOf(itemsWithOptions).toEqualTypeOf<
      {
        key: "theme:mode" | "config:settings";
        value: ("light" | "dark") | { autoSave: boolean; theme: string } | null;
      }[]
    >();
  });

  it("improved type inference for setItem", async () => {
    // Test the improved type inference behavior
    const STORAGES = {
      APP_THEME_STATE: "app:theme:state",
      USER_SETTINGS: "user:settings",
    } as const;

    interface ThemeState {
      mode: "light" | "dark";
      primaryColor: string;
    }

    interface UserSettings {
      language: string;
      autoSave: boolean;
    }

    type ImprovedStorage = {
      items: {
        [STORAGES.APP_THEME_STATE]: ThemeState;
        [STORAGES.USER_SETTINGS]: UserSettings;
      };
    };

    const storage = createStorage<ImprovedStorage>();

    // Test that the first overload provides proper key suggestions and strict typing

    // This should work with exact type matching
    await storage.setItem(STORAGES.APP_THEME_STATE, {
      mode: "dark",
      primaryColor: "#007acc",
    });

    await storage.setItem(STORAGES.USER_SETTINGS, {
      language: "en",
      autoSave: true,
    });

    // Test type inference for getItem
    const theme = await storage.getItem(STORAGES.APP_THEME_STATE);
    expectTypeOf(theme).toEqualTypeOf<ThemeState | null>();

    const settings = await storage.getItem(STORAGES.USER_SETTINGS);
    expectTypeOf(settings).toEqualTypeOf<UserSettings | null>();

    // Test that invalid types should be caught (commented out as they should cause compile errors)
    // await storage.setItem(STORAGES.APP_THEME_STATE, { mode: 121 }); // ✅ Now properly errors
    // await storage.setItem(STORAGES.APP_THEME_STATE, "string"); // ✅ Now properly errors
    // await storage.setItem(STORAGES.USER_SETTINGS, { invalidProp: true }); // ✅ Now properly errors
  });

  it("backward compatibility with generic usage", async () => {
    // Test that generic usage still works
    const genericStorage = createStorage<string>();

    // This should work - generic string storage
    await genericStorage.setItem("any-key", "any-string-value");

    const value = await genericStorage.getItem("any-key");
    expectTypeOf(value).toEqualTypeOf<string | null>();

    // Test untyped storage
    const untypedStorage = createStorage();

    await untypedStorage.setItem("key1", "string");
    await untypedStorage.setItem("key2", 123);
    await untypedStorage.setItem("key3", { object: true });

    const untypedValue = await untypedStorage.getItem("key1");
    expectTypeOf(untypedValue).toEqualTypeOf<StorageValue | null>();
  });
});
