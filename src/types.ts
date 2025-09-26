export type StorageValue = null | string | number | boolean | object;
export type WatchEvent = "update" | "remove";
export type WatchCallback = (event: WatchEvent, key: string) => any;

type MaybePromise<T> = T | Promise<T>;

type MaybeDefined<T> = T extends any ? T : any;

export type Unwatch = () => MaybePromise<void>;

export interface StorageMeta {
  atime?: Date;
  mtime?: Date;
  ttl?: number;
  [key: string]: StorageValue | Date | undefined;
}

// TODO: type ttl
export type TransactionOptions = Record<string, any>;

export type GetKeysOptions = TransactionOptions & {
  maxDepth?: number;
};

export interface DriverFlags {
  maxDepth?: boolean;
  ttl?: boolean;
}

export interface QueueOptions {
  batchSize?: number;
  flushInterval?: number;
  maxQueueSize?: number;
  mergeUpdates?: boolean;
}

export interface Driver<OptionsT = any, InstanceT = any> {
  name?: string;
  flags?: DriverFlags;
  options?: OptionsT;
  getInstance?: () => InstanceT;
  hasItem: (key: string, opts: TransactionOptions) => MaybePromise<boolean>;
  getItem: (
    key: string,
    opts?: TransactionOptions
  ) => MaybePromise<StorageValue>;
  /** @experimental */
  getItems?: (
    items: { key: string; options?: TransactionOptions }[],
    commonOptions?: TransactionOptions
  ) => MaybePromise<{ key: string; value: StorageValue }[]>;
  /** @experimental */
  getItemRaw?: (key: string, opts: TransactionOptions) => MaybePromise<unknown>;
  setItem?: (
    key: string,
    value: string,
    opts: TransactionOptions
  ) => MaybePromise<void>;
  /** @experimental */
  setItems?: (
    items: { key: string; value: string; options?: TransactionOptions }[],
    commonOptions?: TransactionOptions
  ) => MaybePromise<void>;
  /** @experimental */
  setItemRaw?: (
    key: string,
    value: any,
    opts: TransactionOptions
  ) => MaybePromise<void>;
  removeItem?: (key: string, opts: TransactionOptions) => MaybePromise<void>;
  getMeta?: (
    key: string,
    opts: TransactionOptions
  ) => MaybePromise<StorageMeta | null>;
  getKeys: (base: string, opts: GetKeysOptions) => MaybePromise<string[]>;
  clear?: (base: string, opts: TransactionOptions) => MaybePromise<void>;
  dispose?: () => MaybePromise<void>;
  watch?: (callback: WatchCallback) => MaybePromise<Unwatch>;

  // Synchronous API methods
  hasItemSync?: (key: string, opts: TransactionOptions) => boolean;
  getItemSync?: (key: string, opts?: TransactionOptions) => StorageValue;
  /** @experimental */
  getItemsSync?: (
    items: { key: string; options?: TransactionOptions }[],
    commonOptions?: TransactionOptions
  ) => { key: string; value: StorageValue }[];
  /** @experimental */
  getItemRawSync?: (key: string, opts: TransactionOptions) => unknown;
  setItemSync?: (key: string, value: string, opts: TransactionOptions) => void;
  /** @experimental */
  setItemsSync?: (
    items: { key: string; value: string; options?: TransactionOptions }[],
    commonOptions?: TransactionOptions
  ) => void;
  /** @experimental */
  setItemRawSync?: (key: string, value: any, opts: TransactionOptions) => void;
  removeItemSync?: (key: string, opts: TransactionOptions) => void;
  getMetaSync?: (key: string, opts: TransactionOptions) => StorageMeta | null;
  getKeysSync?: (base: string, opts: GetKeysOptions) => string[];
  clearSync?: (base: string, opts: TransactionOptions) => void;
}

type StorageDefinition = {
  items: Record<string, unknown>;
  [key: string]: unknown;
};

type StorageItemMap<T> = T extends StorageDefinition ? T["items"] : T;
type StorageItemType<T, K> = K extends keyof StorageItemMap<T>
  ? StorageItemMap<T>[K]
  : T extends StorageDefinition
    ? StorageValue
    : T;

export type MigrationFunction<T extends StorageValue = StorageValue> = (
  storage: Storage<T>
) => Promise<void> | void;

export interface MigrationOptions<T extends StorageValue = StorageValue> {
  [version: number]: MigrationFunction<T>;
}

export interface MigrationHooks<T extends StorageValue = StorageValue> {
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

export interface Storage<T extends StorageValue = StorageValue> {
  // Item
  hasItem<
    U extends Extract<T, StorageDefinition>,
    K extends keyof StorageItemMap<U>,
  >(
    key: K,
    opts?: TransactionOptions
  ): Promise<boolean>;
  hasItem(key: string, opts?: TransactionOptions): Promise<boolean>;

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

  /** @experimental */
  getItems<
    U extends Extract<T, StorageDefinition>,
    K extends keyof StorageItemMap<U>,
  >(
    items: (K | { key: K; options?: TransactionOptions })[],
    commonOptions?: TransactionOptions
  ): Promise<{ key: K; value: StorageItemType<T, K> | null }[]>;
  getItems<U extends StorageValue>(
    items: T extends StorageDefinition
      ? never
      : (string | { key: string; options?: TransactionOptions })[],
    commonOptions?: TransactionOptions
  ): Promise<{ key: string; value: U | null }[]>;

  // Internal bypass methods for library use
  _getItemsInternal(
    items: (string | { key: string; options?: TransactionOptions })[],
    commonOptions?: TransactionOptions
  ): Promise<{ key: string; value: any }[]>;
  /** @experimental See https://github.com/unjs/electron-async-storage/issues/142 */
  getItemRaw: <T = any>(
    key: string,
    opts?: TransactionOptions
  ) => Promise<MaybeDefined<T> | null>;

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

  // Internal bypass methods for library use
  _setItemInternal(
    key: string,
    value: any,
    opts?: TransactionOptions
  ): Promise<void>;

  /** @experimental */
  setItems<
    U extends Extract<T, StorageDefinition>,
    K extends keyof StorageItemMap<U>,
  >(
    items: {
      key: K;
      value: StorageItemType<T, K>;
      options?: TransactionOptions;
    }[],
    commonOptions?: TransactionOptions
  ): Promise<void>;
  setItems<U extends StorageValue>(
    items: T extends StorageDefinition
      ? never
      : { key: string; value: U; options?: TransactionOptions }[],
    commonOptions?: TransactionOptions
  ): Promise<void>;

  // Internal bypass methods for library use
  _setItemsInternal(
    items: { key: string; value: any; options?: TransactionOptions }[],
    commonOptions?: TransactionOptions
  ): Promise<void>;
  /** @experimental See https://github.com/unjs/electron-async-storage/issues/142 */
  setItemRaw: <T = any>(
    key: string,
    value: MaybeDefined<T>,
    opts?: TransactionOptions
  ) => Promise<void>;

  removeItem<
    U extends Extract<T, StorageDefinition>,
    K extends keyof StorageItemMap<U>,
  >(
    key: K,
    opts?:
      | (TransactionOptions & { removeMeta?: boolean })
      | boolean /* legacy: removeMeta */
  ): Promise<void>;
  removeItem(
    key: string,
    opts?:
      | (TransactionOptions & { removeMeta?: boolean })
      | boolean /* legacy: removeMeta */
  ): Promise<void>;

  // Meta
  getMeta: (
    key: string,
    opts?:
      | (TransactionOptions & { nativeOnly?: boolean })
      | boolean /* legacy: nativeOnly */
  ) => MaybePromise<StorageMeta>;
  setMeta: (
    key: string,
    value: StorageMeta,
    opts?: TransactionOptions
  ) => Promise<void>;
  removeMeta: (key: string, opts?: TransactionOptions) => Promise<void>;
  // Keys
  getKeys: (base?: string, opts?: GetKeysOptions) => Promise<string[]>;
  // Utils
  clear: (base?: string, opts?: TransactionOptions) => Promise<void>;
  dispose: () => Promise<void>;
  watch: (callback: WatchCallback) => Promise<Unwatch>;
  unwatch: () => Promise<void>;
  // Mount
  mount: (base: string, driver: Driver) => Storage;
  unmount: (base: string, dispose?: boolean) => Promise<void>;
  getMount: (key?: string) => { base: string; driver: Driver };
  getMounts: (
    base?: string,
    options?: { parents?: boolean }
  ) => { base: string; driver: Driver }[];
  // Aliases
  keys: Storage["getKeys"];
  get: Storage<T>["getItem"];
  set: Storage<T>["setItem"];
  has: Storage<T>["hasItem"];
  del: Storage<T>["removeItem"];
  remove: Storage<T>["removeItem"];

  // Synchronous API methods
  hasItemSync<
    U extends Extract<T, StorageDefinition>,
    K extends keyof StorageItemMap<U>,
  >(
    key: K,
    opts?: TransactionOptions
  ): boolean;
  hasItemSync(key: string, opts?: TransactionOptions): boolean;

  getItemSync<
    U extends Extract<T, StorageDefinition>,
    K extends string & keyof StorageItemMap<U>,
  >(
    key: K,
    ops?: TransactionOptions
  ): StorageItemType<T, K> | null;
  getItemSync<R = StorageItemType<T, string>>(
    key: string,
    opts?: TransactionOptions
  ): R | null;

  /** @experimental */
  getItemsSync<
    U extends Extract<T, StorageDefinition>,
    K extends keyof StorageItemMap<U>,
  >(
    items: (K | { key: K; options?: TransactionOptions })[],
    commonOptions?: TransactionOptions
  ): { key: K; value: StorageItemType<T, K> | null }[];
  getItemsSync<U extends StorageValue>(
    items: T extends StorageDefinition
      ? never
      : (string | { key: string; options?: TransactionOptions })[],
    commonOptions?: TransactionOptions
  ): { key: string; value: U | null }[];

  /** @experimental */
  getItemRawSync: <T = any>(
    key: string,
    opts?: TransactionOptions
  ) => MaybeDefined<T> | null;

  setItemSync<
    U extends Extract<T, StorageDefinition>,
    K extends keyof StorageItemMap<U>,
  >(
    key: K,
    value: StorageItemType<T, K>,
    opts?: TransactionOptions
  ): void;
  setItemSync<U extends StorageValue>(
    key: T extends StorageDefinition ? never : string,
    value: T extends StorageDefinition ? never : U,
    opts?: TransactionOptions
  ): void;

  /** @experimental */
  setItemsSync<
    U extends Extract<T, StorageDefinition>,
    K extends keyof StorageItemMap<U>,
  >(
    items: {
      key: K;
      value: StorageItemType<T, K>;
      options?: TransactionOptions;
    }[],
    commonOptions?: TransactionOptions
  ): void;
  setItemsSync<U extends StorageValue>(
    items: T extends StorageDefinition
      ? never
      : { key: string; value: U; options?: TransactionOptions }[],
    commonOptions?: TransactionOptions
  ): void;

  /** @experimental */
  setItemRawSync: <T = any>(
    key: string,
    value: MaybeDefined<T>,
    opts?: TransactionOptions
  ) => void;

  removeItemSync<
    U extends Extract<T, StorageDefinition>,
    K extends keyof StorageItemMap<U>,
  >(
    key: K,
    opts?:
      | (TransactionOptions & { removeMeta?: boolean })
      | boolean /* legacy: removeMeta */
  ): void;
  removeItemSync(
    key: string,
    opts?:
      | (TransactionOptions & { removeMeta?: boolean })
      | boolean /* legacy: removeMeta */
  ): void;

  // Meta - sync versions
  getMetaSync: (
    key: string,
    opts?:
      | (TransactionOptions & { nativeOnly?: boolean })
      | boolean /* legacy: nativeOnly */
  ) => StorageMeta;
  setMetaSync: (
    key: string,
    value: StorageMeta,
    opts?: TransactionOptions
  ) => void;
  removeMetaSync: (key: string, opts?: TransactionOptions) => void;

  // Keys - sync version
  getKeysSync: (base?: string, opts?: GetKeysOptions) => string[];

  // Utils - sync version
  clearSync: (base?: string, opts?: TransactionOptions) => void;

  // Sync aliases
  keysSync: Storage["getKeysSync"];
  getSync: Storage<T>["getItemSync"];
  setSync: Storage<T>["setItemSync"];
  hasSync: Storage<T>["hasItemSync"];
  delSync: Storage<T>["removeItemSync"];
  removeSync: Storage<T>["removeItemSync"];

  // migrate
  migrate: () => Promise<void>;
  getStorageVersion: () => Promise<number | null>;
}
