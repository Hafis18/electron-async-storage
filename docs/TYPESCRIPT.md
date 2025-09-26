# TypeScript Guide

This comprehensive guide covers advanced TypeScript usage with electron-async-storage, including type-safe storage schemas, conditional typing, custom driver development, and sophisticated type patterns.

## Table of Contents

- [Type System Overview](#type-system-overview)
- [Storage Definitions](#storage-definitions)
- [Conditional Typing](#conditional-typing)
- [Driver Type Safety](#driver-type-safety)
- [Advanced Type Patterns](#advanced-type-patterns)
- [Generic Utilities](#generic-utilities)
- [Type Guards and Validation](#type-guards-and-validation)
- [Migration Typing](#migration-typing)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)

## Type System Overview

electron-async-storage provides comprehensive TypeScript support with sophisticated conditional typing, generic constraints, and type inference.

### Core Type Architecture

```typescript
// Storage value types - anything that can be serialized
type StorageValue = null | string | number | boolean | object;

// Storage definitions for schema-based typing
type StorageDefinition = {
  items: Record<string, unknown>;
  [key: string]: unknown;
};

// Conditional type mapping for storage items
type StorageItemMap<T> = T extends StorageDefinition ? T["items"] : T;
type StorageItemType<T, K> = K extends keyof StorageItemMap<T>
  ? StorageItemMap<T>[K]
  : T extends StorageDefinition
    ? StorageValue
    : T;

// Async operation types
type MaybePromise<T> = T | Promise<T>;
type MaybeDefined<T> = T extends any ? T : any;
```

### Type-Safe Storage Creation

```typescript
import { createStorage, Storage } from "electron-async-storage";

// Basic type-safe storage
const storage: Storage<string | number | boolean> = createStorage();

// Schema-based storage with strict typing
interface UserStorageSchema {
  items: {
    "user:profile": UserProfile;
    "user:settings": UserSettings;
    "user:preferences": UserPreferences;
    "session:token": string;
    "session:expiry": Date;
  };
}

const userStorage = createStorage<UserStorageSchema>();

// Type-safe operations with full IntelliSense
await userStorage.setItem("user:profile", userProfile); // ✅ Type-checked
await userStorage.setItem("invalid:key", data); // ❌ Type error
const profile = await userStorage.getItem("user:profile"); // Type: UserProfile | null
```

## Storage Definitions

Storage definitions provide compile-time type safety for storage schemas.

### Defining Storage Schemas

```typescript
// Simple schema definition
interface AppStorageSchema {
  items: {
    "config:theme": "light" | "dark" | "auto";
    "config:language": string;
    "config:debug": boolean;
    "user:profile": UserProfile;
    "cache:api-response": ApiResponse;
  };
}

// Complex nested schema
interface ComplexStorageSchema {
  items: {
    // User management
    "users:profiles": Map<string, UserProfile>;
    "users:sessions": Record<string, UserSession>;
    "users:preferences": UserPreferences[];

    // Application state
    "app:config": AppConfig;
    "app:state": ApplicationState;
    "app:metadata": {
      version: string;
      lastUpdated: Date;
      features: Set<string>;
    };

    // Cache entries with TTL
    "cache:api-data": CachedApiData;
    "cache:user-data": Map<string, { data: any; expiry: Date }>;

    // Complex nested structures
    "analytics:events": AnalyticsEvent[];
    "analytics:aggregates": Record<string, AggregateData>;
  };
}

// Usage with full type safety
const appStorage = createStorage<ComplexStorageSchema>({
  driver: fsDriver({ base: "./app-data" }),
});

// All operations are fully typed
const userProfiles = await appStorage.getItem("users:profiles");
// Type: Map<string, UserProfile> | null

await appStorage.setItem("app:config", {
  theme: "dark",
  version: "1.0.0",
  debug: process.env.NODE_ENV === "development",
});

// Type error for invalid operations
await appStorage.setItem("users:profiles", "invalid"); // ❌ Type error
```

### Dynamic Schema Types

```typescript
// Generate schema from interfaces
type CreateStorageSchema<T extends Record<string, any>> = {
  items: T;
};

interface ApiEndpoints {
  "/users": User[];
  "/posts": Post[];
  "/comments": Comment[];
}

type ApiCacheSchema = CreateStorageSchema<{
  [K in keyof ApiEndpoints as `cache:${string & K}`]: {
    data: ApiEndpoints[K];
    expiry: Date;
    etag?: string;
  };
}>;

const apiCache = createStorage<ApiCacheSchema>();

await apiCache.setItem("cache:/users", {
  data: users,
  expiry: new Date(Date.now() + 3_600_000),
  etag: "abc123",
});
```

### Schema Validation

```typescript
// Runtime schema validation with TypeScript
class TypedStorage<T extends StorageDefinition> {
  private schema: Record<string, (value: any) => boolean>;

  constructor(
    private storage: Storage<T>,
    validators: {
      [K in keyof T["items"]]: (value: any) => value is T["items"][K];
    }
  ) {
    this.schema = validators;
  }

  async setItem<K extends keyof T["items"]>(
    key: K,
    value: T["items"][K]
  ): Promise<void> {
    const validator = this.schema[key];
    if (!validator(value)) {
      throw new TypeError(`Invalid value for key ${String(key)}`);
    }
    return this.storage.setItem(key, value);
  }

  async getItem<K extends keyof T["items"]>(
    key: K
  ): Promise<T["items"][K] | null> {
    const value = await this.storage.getItem(key);
    if (value !== null) {
      const validator = this.schema[key];
      if (!validator(value)) {
        console.warn(`Stored value for ${String(key)} fails validation`);
        return null;
      }
    }
    return value;
  }
}

// Usage with runtime validation
const typedStorage = new TypedStorage(userStorage, {
  "user:profile": (value): value is UserProfile =>
    typeof value === "object" &&
    value !== null &&
    typeof value.name === "string" &&
    typeof value.email === "string",

  "user:settings": (value): value is UserSettings =>
    typeof value === "object" &&
    value !== null &&
    typeof value.theme === "string",

  "session:token": (value): value is string => typeof value === "string",
});
```

## Conditional Typing

electron-async-storage uses sophisticated conditional typing for flexible APIs.

### Storage Item Type Resolution

```typescript
// Internal conditional type system
type StorageItemType<T, K> = K extends keyof StorageItemMap<T>
  ? StorageItemMap<T>[K]
  : T extends StorageDefinition
    ? StorageValue
    : T;

// Examples of type resolution
interface MySchema {
  items: {
    "user:name": string;
    "user:age": number;
    "user:active": boolean;
  };
}

type NameType = StorageItemType<MySchema, "user:name">; // string
type AgeType = StorageItemType<MySchema, "user:age">; // number
type UnknownType = StorageItemType<MySchema, "unknown">; // StorageValue
```

### Method Overloads with Conditional Types

```typescript
interface Storage<T extends StorageValue = StorageValue> {
  // Conditional overloads for hasItem
  hasItem<
    U extends Extract<T, StorageDefinition>,
    K extends keyof StorageItemMap<U>,
  >(
    key: K,
    opts?: TransactionOptions
  ): Promise<boolean>;
  hasItem(key: string, opts?: TransactionOptions): Promise<boolean>;

  // Conditional overloads for getItem
  getItem<
    U extends Extract<T, StorageDefinition>,
    K extends string & keyof StorageItemMap<U>,
  >(
    key: K,
    ops?: TransactionOptions
  ): Promise<StorageItemType<T, K> | null>;
  getItem<R = StorageItemType<T, string>>(
    key: string,
    opts?: TransactionOptions
  ): Promise<R | null>;

  // Conditional overloads for setItem
  setItem<
    U extends Extract<T, StorageDefinition>,
    K extends keyof StorageItemMap<U>,
  >(
    key: K,
    value: StorageItemType<T, K>,
    opts?: TransactionOptions
  ): Promise<void>;
  setItem<U extends StorageValue>(
    key: T extends StorageDefinition ? never : string,
    value: T extends StorageDefinition ? never : U,
    opts?: TransactionOptions
  ): Promise<void>;
}
```

### Advanced Conditional Patterns

```typescript
// Conditional batch operations
interface BatchGetItems<T extends StorageDefinition> {
  <K extends keyof T["items"]>(
    items: (K | { key: K; options?: TransactionOptions })[],
    commonOptions?: TransactionOptions
  ): Promise<{ key: K; value: T["items"][K] | null }[]>;
}

// Conditional key extraction
type ExtractKeys<T, Prefix extends string> = T extends StorageDefinition
  ? {
      [K in keyof T["items"]]: K extends `${Prefix}${string}` ? K : never;
    }[keyof T["items"]]
  : string;

// Usage
type UserKeys = ExtractKeys<AppStorageSchema, "user:">;
// Result: 'user:profile' | 'user:settings' | 'user:preferences'

// Conditional value extraction
type ExtractValues<T, Prefix extends string> = T extends StorageDefinition
  ? {
      [K in keyof T["items"]]: K extends `${Prefix}${string}`
        ? T["items"][K]
        : never;
    }[keyof T["items"]]
  : StorageValue;

type UserValues = ExtractValues<AppStorageSchema, "user:">;
// Result: UserProfile | UserSettings | UserPreferences
```

## Driver Type Safety

Create type-safe custom drivers with full TypeScript support.

### Type-Safe Driver Creation

```typescript
import { defineDriver, Driver } from "electron-async-storage/drivers/utils";

// Driver options interface
interface DatabaseDriverOptions {
  connectionString: string;
  database: string;
  table?: string;
  timeout?: number;
  retries?: number;
}

// Driver instance interface
interface DatabaseDriverInstance {
  connection: DatabaseConnection;
  query: (sql: string, params?: any[]) => Promise<any[]>;
  transaction: <T>(fn: (tx: Transaction) => Promise<T>) => Promise<T>;
}

// Type-safe driver definition
export default defineDriver<DatabaseDriverOptions, DatabaseDriverInstance>(
  (
    options: DatabaseDriverOptions
  ): Driver<DatabaseDriverOptions, DatabaseDriverInstance> => {
    // Validate required options at compile time
    const requiredOptions: (keyof DatabaseDriverOptions)[] = [
      "connectionString",
      "database",
    ];
    for (const option of requiredOptions) {
      if (!options[option]) {
        throw createRequiredError("database", option);
      }
    }

    let connection: DatabaseConnection;
    let instance: DatabaseDriverInstance;

    return {
      name: "database",
      options,
      flags: {
        maxDepth: false, // Database doesn't support depth filtering
        ttl: true, // Database supports TTL via expires column
      },

      getInstance: (): DatabaseDriverInstance => instance,

      async hasItem(key: string, opts: TransactionOptions): Promise<boolean> {
        const result = await instance.query(
          "SELECT 1 FROM storage WHERE key = ? AND (expires IS NULL OR expires > ?)",
          [key, new Date()]
        );
        return result.length > 0;
      },

      async getItem(
        key: string,
        opts?: TransactionOptions
      ): Promise<string | null> {
        const result = await instance.query(
          "SELECT value FROM storage WHERE key = ? AND (expires IS NULL OR expires > ?)",
          [key, new Date()]
        );
        return result[0]?.value ?? null;
      },

      async setItem(
        key: string,
        value: string,
        opts: TransactionOptions
      ): Promise<void> {
        const expires = opts.ttl ? new Date(Date.now() + opts.ttl) : null;
        await instance.query(
          "INSERT INTO storage (key, value, expires) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = ?, expires = ?",
          [key, value, expires, value, expires]
        );
      },

      // ... other methods with full type safety
    };
  }
);

// Usage with type inference
const dbStorage = createStorage({
  driver: databaseDriver({
    connectionString: "postgresql://...",
    database: "myapp",
    table: "storage", // Optional with type safety
    timeout: 5000, // Optional with type safety
  }),
});

// Access driver instance with types
const dbInstance = dbStorage.getMount().driver.getInstance();
const result = await dbInstance.query(
  "SELECT * FROM storage WHERE key LIKE ?",
  ["user:%"]
);
```

### Generic Driver Wrapper

```typescript
// Generic wrapper for adding functionality to existing drivers
class DriverWrapper<T extends Driver> {
  constructor(private driver: T) {}

  // Preserve original driver typing
  wrap(): T & {
    metrics: PerformanceMetrics;
    cache: LRUCache<string, any>;
  } {
    const metrics = new PerformanceMetrics();
    const cache = new LRUCache<string, any>(1000);

    return new Proxy(this.driver, {
      get(target, prop) {
        if (prop === "metrics") return metrics;
        if (prop === "cache") return cache;

        const originalMethod = target[prop as keyof T];
        if (typeof originalMethod === "function") {
          return async function (...args: any[]) {
            const start = performance.now();
            try {
              const result = await originalMethod.apply(target, args);
              metrics.record(String(prop), performance.now() - start);
              return result;
            } catch (error) {
              metrics.recordError(String(prop), error as Error);
              throw error;
            }
          };
        }
        return originalMethod;
      },
    }) as T & { metrics: PerformanceMetrics; cache: LRUCache<string, any> };
  }
}

// Usage
const wrappedDriver = new DriverWrapper(fsDriver({ base: "./data" })).wrap();
const storage = createStorage({ driver: wrappedDriver });

// Access additional functionality with types
console.log("Driver metrics:", wrappedDriver.metrics.getStats());
console.log("Cache size:", wrappedDriver.cache.size);
```

## Advanced Type Patterns

### Mapped Types for Storage Operations

```typescript
// Create typed wrappers for storage operations
type StorageOperations<T extends StorageDefinition> = {
  readonly [K in keyof T["items"] as `get${Capitalize<string & K>}`]: () => Promise<
    T["items"][K] | null
  >;
} & {
  readonly [K in keyof T["items"] as `set${Capitalize<string & K>}`]: (
    value: T["items"][K]
  ) => Promise<void>;
} & {
  readonly [K in keyof T["items"] as `has${Capitalize<string & K>}`]: () => Promise<boolean>;
};

// Implementation
class TypedStorageWrapper<T extends StorageDefinition> {
  constructor(private storage: Storage<T>) {}

  // Generate methods dynamically with type safety
  createOperations(): StorageOperations<T> {
    return new Proxy({} as StorageOperations<T>, {
      get: (_, prop: string) => {
        if (prop.startsWith("get")) {
          const key = prop.slice(3).toLowerCase();
          return () => this.storage.getItem(key as keyof T["items"]);
        }
        if (prop.startsWith("set")) {
          const key = prop.slice(3).toLowerCase();
          return (value: any) =>
            this.storage.setItem(key as keyof T["items"], value);
        }
        if (prop.startsWith("has")) {
          const key = prop.slice(3).toLowerCase();
          return () => this.storage.hasItem(key as keyof T["items"]);
        }
        throw new Error(`Unknown method: ${prop}`);
      },
    });
  }
}

// Usage with auto-generated methods
const wrapper = new TypedStorageWrapper(appStorage);
const ops = wrapper.createOperations();

// Auto-generated typed methods
const profile = await ops.getUserProfile(); // Type: UserProfile | null
await ops.setUserSettings(userSettings); // Type-checked parameter
const hasProfile = await ops.hasUserProfile(); // Type: boolean
```

### Template Literal Types

```typescript
// Use template literal types for key patterns
type KeyPattern<
  Prefix extends string,
  Suffix extends string = string,
> = `${Prefix}:${Suffix}`;

type UserKeys = KeyPattern<"user", "profile" | "settings" | "preferences">;
// Result: 'user:profile' | 'user:settings' | 'user:preferences'

type CacheKeys<T extends string> = KeyPattern<"cache", T>;
type ApiCacheKeys = CacheKeys<"/users" | "/posts" | "/comments">;
// Result: 'cache:/users' | 'cache:/posts' | 'cache:/comments'

// Dynamic key validation
interface KeyedStorageSchema<TKeys extends string> {
  items: Record<TKeys, any>;
}

class KeyValidator<TKeys extends string> {
  constructor(private validKeys: Set<TKeys>) {}

  validateKey(key: string): key is TKeys {
    return this.validKeys.has(key as TKeys);
  }

  async safeGetItem<T extends KeyedStorageSchema<TKeys>>(
    storage: Storage<T>,
    key: string
  ): Promise<any | null> {
    if (!this.validateKey(key)) {
      throw new Error(`Invalid key: ${key}`);
    }
    return storage.getItem(key as TKeys);
  }
}

// Usage
const userKeyValidator = new KeyValidator(
  new Set(["user:profile", "user:settings"] as const)
);
const value = await userKeyValidator.safeGetItem(userStorage, "user:profile"); // ✅ Valid
// await userKeyValidator.safeGetItem(userStorage, 'invalid:key') // ❌ Runtime error
```

### Higher-Order Types

```typescript
// Extract utility types from storage schemas
type ExtractStorageKeys<T> = T extends StorageDefinition
  ? keyof T["items"] extends string
    ? keyof T["items"]
    : never
  : never;

type ExtractStorageValues<T> = T extends StorageDefinition
  ? T["items"][keyof T["items"]]
  : never;

// Utility for creating sub-schemas
type SubSchema<T extends StorageDefinition, Prefix extends string> = {
  items: {
    [K in keyof T["items"] as K extends `${Prefix}${infer Rest}`
      ? Rest
      : never]: T["items"][K];
  };
};

// Create namespaced storage from main schema
type UserSubSchema = SubSchema<AppStorageSchema, "user:">;
// Result: { items: { profile: UserProfile; settings: UserSettings; preferences: UserPreferences } }

// Implementation
function createSubStorage<T extends StorageDefinition, P extends string>(
  storage: Storage<T>,
  prefix: P
): Storage<SubSchema<T, P>> {
  return prefixStorage(storage, prefix) as any;
}

// Usage
const userStorage = createSubStorage(appStorage, "user:");
await userStorage.setItem("profile", userProfile); // Stored as 'user:profile'
```

## Generic Utilities

### Type-Safe Utility Functions

```typescript
// Generic snapshot with type preservation
async function typedSnapshot<T extends StorageDefinition>(
  storage: Storage<T>,
  base: string
): Promise<Partial<T["items"]>> {
  const snapshot = await snapshot(storage as Storage, base);
  return snapshot as Partial<T["items"]>;
}

// Type-safe restore function
async function typedRestore<T extends StorageDefinition>(
  storage: Storage<T>,
  data: Partial<T["items"]>,
  base?: string
): Promise<void> {
  await restoreSnapshot(storage as Storage, data as any, base);
}

// Generic migration with type safety
type MigrationFunction<T extends StorageDefinition> = (
  storage: Storage<T>
) => Promise<void> | void;

interface TypedMigrations<T extends StorageDefinition> {
  [version: number]: MigrationFunction<T>;
}

function createTypedStorage<T extends StorageDefinition>(
  options: CreateStorageOptions & {
    migrations?: TypedMigrations<T>;
  }
): Storage<T> {
  return createStorage(options as any);
}
```

### Validation Utilities

```typescript
// Runtime type validation with compile-time safety
interface TypeValidator<T> {
  validate: (value: unknown) => value is T;
  name: string;
}

// Built-in validators
const Validators = {
  string: {
    validate: (value: unknown): value is string => typeof value === "string",
    name: "string",
  },
  number: {
    validate: (value: unknown): value is number => typeof value === "number",
    name: "number",
  },
  boolean: {
    validate: (value: unknown): value is boolean => typeof value === "boolean",
    name: "boolean",
  },
  date: {
    validate: (value: unknown): value is Date => value instanceof Date,
    name: "Date",
  },
  array: <T>(itemValidator: TypeValidator<T>): TypeValidator<T[]> => ({
    validate: (value: unknown): value is T[] =>
      Array.isArray(value) && value.every(itemValidator.validate),
    name: `${itemValidator.name}[]`,
  }),
  object: <T extends Record<string, any>>(schema: {
    [K in keyof T]: TypeValidator<T[K]>;
  }): TypeValidator<T> => ({
    validate: (value: unknown): value is T => {
      if (typeof value !== "object" || value === null) return false;
      for (const [key, validator] of Object.entries(schema)) {
        if (!validator.validate((value as any)[key])) return false;
      }
      return true;
    },
    name: "object",
  }),
} as const;

// Usage
const UserProfileValidator = Validators.object({
  name: Validators.string,
  email: Validators.string,
  age: Validators.number,
  active: Validators.boolean,
  createdAt: Validators.date,
});

class ValidatedStorage<T extends StorageDefinition> {
  private validators: Map<keyof T["items"], TypeValidator<any>> = new Map();

  constructor(private storage: Storage<T>) {}

  addValidator<K extends keyof T["items"]>(
    key: K,
    validator: TypeValidator<T["items"][K]>
  ) {
    this.validators.set(key, validator);
    return this;
  }

  async getItem<K extends keyof T["items"]>(
    key: K
  ): Promise<T["items"][K] | null> {
    const value = await this.storage.getItem(key);
    if (value === null) return null;

    const validator = this.validators.get(key);
    if (validator && !validator.validate(value)) {
      throw new TypeError(
        `Value for key ${String(key)} failed ${validator.name} validation`
      );
    }

    return value;
  }

  async setItem<K extends keyof T["items"]>(
    key: K,
    value: T["items"][K]
  ): Promise<void> {
    const validator = this.validators.get(key);
    if (validator && !validator.validate(value)) {
      throw new TypeError(
        `Value for key ${String(key)} failed ${validator.name} validation`
      );
    }

    return this.storage.setItem(key, value);
  }
}

// Usage with type safety
const validatedStorage = new ValidatedStorage(userStorage)
  .addValidator("user:profile", UserProfileValidator)
  .addValidator(
    "user:settings",
    Validators.object({
      theme: Validators.string,
      notifications: Validators.boolean,
    })
  );

await validatedStorage.setItem("user:profile", userProfile); // Validates at runtime
```

## Type Guards and Validation

### Advanced Type Guards

```typescript
// Generic type guard factory
function createTypeGuard<T>(
  predicate: (value: unknown) => boolean,
  name: string
): (value: unknown) => value is T {
  const guard = (value: unknown): value is T => predicate(value);
  Object.defineProperty(guard, "name", { value: `is${name}` });
  return guard;
}

// Specific type guards for storage values
const isUserProfile = createTypeGuard<UserProfile>(
  (value): value is UserProfile =>
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "email" in value &&
    typeof (value as any).name === "string" &&
    typeof (value as any).email === "string",
  "UserProfile"
);

const isUserSettings = createTypeGuard<UserSettings>(
  (value): value is UserSettings =>
    typeof value === "object" &&
    value !== null &&
    "theme" in value &&
    typeof (value as any).theme === "string",
  "UserSettings"
);

// Storage with runtime type checking
class GuardedStorage<T extends StorageDefinition> {
  private guards = new Map<keyof T["items"], (value: unknown) => boolean>();

  constructor(private storage: Storage<T>) {}

  addGuard<K extends keyof T["items"]>(
    key: K,
    guard: (value: unknown) => value is T["items"][K]
  ): this {
    this.guards.set(key, guard);
    return this;
  }

  async getItem<K extends keyof T["items"]>(
    key: K
  ): Promise<T["items"][K] | null> {
    const value = await this.storage.getItem(key);
    if (value === null) return null;

    const guard = this.guards.get(key);
    if (guard && !guard(value)) {
      console.warn(`Type guard failed for key ${String(key)}`);
      return null;
    }

    return value;
  }
}

// Usage
const guardedStorage = new GuardedStorage(userStorage)
  .addGuard("user:profile", isUserProfile)
  .addGuard("user:settings", isUserSettings);

const profile = await guardedStorage.getItem("user:profile");
// Type: UserProfile | null, with runtime validation
```

## Migration Typing

### Type-Safe Migrations

```typescript
// Version-specific storage schemas
interface V1StorageSchema {
  items: {
    'user-profile': { name: string; email: string }  // Old format
    'app-config': { theme: string }
  }
}

interface V2StorageSchema {
  items: {
    'user:profile': UserProfile   // New format
    'user:settings': UserSettings
    'app:config': AppConfig
  }
}

interface V3StorageSchema extends V2StorageSchema {
  items: V2StorageSchema['items'] & {
    'user:preferences': UserPreferences
    'cache:api-data': CacheData
  }
}

// Type-safe migration functions
type VersionedMigration<From extends StorageDefinition, To extends StorageDefinition> = (
  storage: Storage<From>
) => Promise<void>

const migrations = {
  1: async (storage: Storage<V1StorageSchema>) => {
    // Migrate from unstructured to V1
    const oldProfile = await storage.getItem('user-profile')
    if (oldProfile) {
      await storage.setItem('user:profile', {
        ...oldProfile,
        id: generateId(),
        createdAt: new Date()
      } as any)
      await storage.removeItem('user-profile')
    }
  } satisfies VersionedMigration<any, V1StorageSchema>,

  2: async (storage: Storage<V1StorageSchema>) => {
    // Migrate from V1 to V2
    const profile = await storage.getItem('user-profile')
    const config = await storage.getItem('app-config')

    if (profile) {
      await (storage as any).setItem('user:profile', {
        ...profile,
        version: 2
      })
      await storage.removeItem('user-profile')
    }

    if (config) {
      await (storage as any).setItem('app:config', {
        ...config,
        version: 2
      })
      await storage.removeItem('app-config')
    }
  } satisfies VersionedMigration<V1StorageSchema, V2StorageSchema>,

  3: async (storage: Storage<V2StorageSchema>) => {
    // Migrate from V2 to V3
    const profile = await storage.getItem('user:profile')
    if (profile && !(await storage.hasItem('user:preferences'))) {
      await (storage as any).setItem('user:preferences', {
        theme: 'light',
        notifications: true,
        language: 'en'
      })
    }
  } satisfies VersionedMigration<V2StorageSchema, V3StorageSchema>
}

// Create storage with versioned migrations
const versionedStorage = createStorage<V3StorageSchema>({
  version: 3,
  migrations,
  driver: fsDriver({ base: './data' })
})
```

## Error Handling

### Type-Safe Error Handling

```typescript
// Custom error types with generic constraints
class StorageError<T extends StorageDefinition = any> extends Error {
  constructor(
    message: string,
    public readonly key?: keyof T["items"],
    public readonly operation?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "StorageError";
  }
}

class ValidationError<
  T extends StorageDefinition = any,
> extends StorageError<T> {
  constructor(
    key: keyof T["items"],
    expectedType: string,
    actualValue: unknown,
    cause?: Error
  ) {
    super(
      `Validation failed for key ${String(key)}: expected ${expectedType}, got ${typeof actualValue}`,
      key,
      "validation",
      cause
    );
    this.name = "ValidationError";
  }
}

// Result type for error handling
type StorageResult<T> =
  | { success: true; data: T }
  | { success: false; error: StorageError };

// Safe storage wrapper with result types
class SafeStorage<T extends StorageDefinition> {
  constructor(private storage: Storage<T>) {}

  async safeGetItem<K extends keyof T["items"]>(
    key: K
  ): Promise<StorageResult<T["items"][K] | null>> {
    try {
      const data = await this.storage.getItem(key);
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: new StorageError(
          `Failed to get item ${String(key)}`,
          key,
          "get",
          error instanceof Error ? error : new Error(String(error))
        ),
      };
    }
  }

  async safeSetItem<K extends keyof T["items"]>(
    key: K,
    value: T["items"][K]
  ): Promise<StorageResult<void>> {
    try {
      await this.storage.setItem(key, value);
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: new StorageError(
          `Failed to set item ${String(key)}`,
          key,
          "set",
          error instanceof Error ? error : new Error(String(error))
        ),
      };
    }
  }
}

// Usage with type-safe error handling
const safeStorage = new SafeStorage(userStorage);

const result = await safeStorage.safeGetItem("user:profile");
if (result.success) {
  console.log("Profile:", result.data); // Type: UserProfile | null
} else {
  console.error("Error:", result.error.message);
  if (result.error.key) {
    console.error("Failed key:", result.error.key); // Type: keyof schema['items']
  }
}
```

## Best Practices

### 1. Schema Design

```typescript
// ✅ Good: Hierarchical, well-structured schema
interface WellDesignedSchema {
  items: {
    // User data
    "user:profile": UserProfile;
    "user:settings": UserSettings;
    "user:preferences": UserPreferences;

    // Application state
    "app:config": AppConfig;
    "app:state": ApplicationState;
    "app:cache": AppCache;

    // Feature-specific data
    "analytics:events": AnalyticsEvent[];
    "notifications:queue": NotificationItem[];
  };
}

// ❌ Bad: Flat, inconsistent schema
interface PoorSchema {
  items: {
    userProfile: UserProfile;
    user_settings: UserSettings;
    "app-config": AppConfig;
    notificationsQueue: NotificationItem[];
    analyticsData: any; // Too generic
  };
}
```

### 2. Type Safety Patterns

```typescript
// ✅ Good: Strict typing with validation
class TypeSafeStorage<T extends StorageDefinition> {
  private validators = new Map<keyof T["items"], (value: any) => boolean>();

  constructor(private storage: Storage<T>) {}

  // Require explicit typing for all operations
  async getTypedItem<K extends keyof T["items"]>(
    key: K,
    validator: (value: unknown) => value is T["items"][K]
  ): Promise<T["items"][K] | null> {
    const value = await this.storage.getItem(key);
    if (value === null) return null;

    if (!validator(value)) {
      throw new ValidationError(key, "validated type", value);
    }

    return value;
  }
}

// ✅ Good: Utility types for common patterns
type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];

type StrictSchema<T> = {
  [K in RequiredKeys<T>]-?: T[K];
} & {
  [K in OptionalKeys<T>]?: T[K];
};
```

### 3. Performance-Oriented Types

```typescript
// ✅ Good: Lazy loading with types
class LazyTypedStorage<T extends StorageDefinition> {
  private cache = new Map<keyof T["items"], Promise<any>>();

  constructor(private storage: Storage<T>) {}

  getItemLazy<K extends keyof T["items"]>(
    key: K
  ): Promise<T["items"][K] | null> {
    if (!this.cache.has(key)) {
      this.cache.set(key, this.storage.getItem(key));
    }
    return this.cache.get(key)!;
  }

  invalidateCache(key?: keyof T["items"]) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
}

// ✅ Good: Batch operations with type preservation
async function typedBatchGet<
  T extends StorageDefinition,
  K extends keyof T["items"],
>(
  storage: Storage<T>,
  keys: readonly K[]
): Promise<{ [P in K]: T["items"][P] | null }> {
  const results = await storage.getItems([...keys]);

  return results.reduce(
    (acc, { key, value }) => {
      acc[key as K] = value;
      return acc;
    },
    {} as { [P in K]: T["items"][P] | null }
  );
}
```

### 4. Testing Types

```typescript
// ✅ Good: Type testing utilities
type AssertEqual<T, U> = T extends U ? (U extends T ? true : false) : false;

// Compile-time type tests
const typeTests = {
  storageItemType: null as any as AssertEqual<
    StorageItemType<AppStorageSchema, "user:profile">,
    UserProfile
  >, // Should be true

  batchResultType: null as any as AssertEqual<
    ReturnType<Storage<AppStorageSchema>["getItems"]>,
    Promise<Array<{ key: string; value: any }>>
  >, // Should be true
};

// Runtime type testing
function assertType<T>(_value: T): void {
  // Type assertion for testing
}

// Test storage types
const storage = createStorage<AppStorageSchema>();
const profile = await storage.getItem("user:profile");
assertType<UserProfile | null>(profile); // ✅ Should compile

// const invalid = await storage.getItem('invalid:key') // ❌ Should not compile
```

This comprehensive TypeScript guide provides all the tools and patterns needed to leverage the full power of TypeScript with electron-async-storage, ensuring type safety, developer productivity, and maintainable code.
