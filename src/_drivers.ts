// Auto-generated using scripts/gen-drivers.
// Do not manually edit!

import type { FSStorageOptions as FsLiteOptions } from "electron-async-storage/drivers/fs-lite";
import type { FSStorageOptions as FsOptions } from "electron-async-storage/drivers/fs";
import type { QueueDriverOptions as QueueOptions } from "electron-async-storage/drivers/queue";

export type BuiltinDriverName = "fs-lite" | "fsLite" | "fs" | "memory" | "queue";

export type BuiltinDriverOptions = {
  "fs-lite": FsLiteOptions;
  "fsLite": FsLiteOptions;
  "fs": FsOptions;
  "queue": QueueOptions;
};

export const builtinDrivers = {
  "fs-lite": "electron-async-storage/drivers/fs-lite",
  "fsLite": "electron-async-storage/drivers/fs-lite",
  "fs": "electron-async-storage/drivers/fs",
  "memory": "electron-async-storage/drivers/memory",
  "queue": "electron-async-storage/drivers/queue",
} as const;
