# Migration Guide

This comprehensive guide covers the powerful migration system in electron-async-storage, providing version-based schema evolution with hooks, error handling, and rollback capabilities.

## Table of Contents

- [Migration System Overview](#migration-system-overview)
- [Basic Migration Setup](#basic-migration-setup)
- [Migration Functions](#migration-functions)
- [Migration Hooks](#migration-hooks)
- [Error Handling and Rollback](#error-handling-and-rollback)
- [Advanced Migration Patterns](#advanced-migration-patterns)
- [Migration Testing](#migration-testing)
- [Best Practices](#best-practices)

## Migration System Overview

The migration system enables automatic schema evolution as your application grows and changes. It provides:

- **Version-Based Migrations**: Sequential migration functions tied to version numbers
- **Automatic Execution**: Migrations run automatically when storage is created or migrated
- **Hook System**: Pre/post migration hooks for backup, validation, and cleanup
- **Error Recovery**: Comprehensive error handling with rollback capabilities
- **Atomic Operations**: Internal storage operations that bypass normal serialization

### Migration Architecture

```typescript
interface CreateStorageOptions<T extends StorageValue = StorageValue> {
  version?: number                    // Target schema version
  migrations?: MigrationOptions<T>    // Migration functions by version
  migrationHooks?: MigrationHooks<T>  // Pre/post migration hooks
}

interface MigrationOptions<T extends StorageValue = StorageValue> {
  [version: number]: MigrationFunction<T>
}

type MigrationFunction<T extends StorageValue = StorageValue> = (
  storage: Storage<T>
) => Promise<void> | void

interface MigrationHooks<T extends StorageValue = StorageValue> {
  beforeMigration?: (fromVersion: number, toVersion: number, storage: Storage<T>) => Promise<void> | void
  afterMigration?: (fromVersion: number, toVersion: number, storage: Storage<T>) => Promise<void> | void
  onMigrationError?: (error: Error, fromVersion: number, toVersion: number, storage: Storage<T>) => Promise<void> | void
}
```

## Basic Migration Setup

### Simple Version Migration

```typescript
import { createStorage } from 'electron-async-storage'
import fsDriver from 'electron-async-storage/drivers/fs'

const storage = createStorage({
  driver: fsDriver({ base: './app-data' }),
  version: 3,
  migrations: {
    1: async (storage) => {
      // Migration to version 1: Convert old settings format
      const oldSettings = await storage.getItem('settings')
      if (oldSettings) {
        await storage.setItem('app:settings', {
          ...oldSettings,
          version: 1,
          migrated: true
        })
        await storage.removeItem('settings')
      }
    },

    2: async (storage) => {
      // Migration to version 2: Add user preferences
      const users = await storage.getKeys('users:')
      for (const userKey of users) {
        const user = await storage.getItem(userKey)
        if (user && !user.preferences) {
          user.preferences = {
            theme: 'light',
            notifications: true,
            language: 'en'
          }
          await storage.setItem(userKey, user)
        }
      }
    },

    3: async (storage) => {
      // Migration to version 3: Restructure data hierarchy
      const legacyData = await storage.getKeys('legacy:')
      for (const key of legacyData) {
        const value = await storage.getItem(key)
        const newKey = key.replace('legacy:', 'app:data:')
        await storage.setItem(newKey, value)
        await storage.removeItem(key)
      }
    }
  }
})

// Migrations run automatically during storage creation
await storage.migrate() // Explicit migration if needed
```

### Checking Migration Status

```typescript
// Check current version
const currentVersion = await storage.getStorageVersion()
console.log('Current storage version:', currentVersion)

// Determine if migration is needed
const needsMigration = currentVersion === null || currentVersion < 3
if (needsMigration) {
  console.log('Migration required')
  await storage.migrate()
}
```

## Migration Functions

Migration functions have access to the full storage API and can perform any storage operations.

### Data Transformation Example

```typescript
const storage = createStorage({
  version: 2,
  migrations: {
    1: async (storage) => {
      // Convert string dates to Date objects
      const items = await storage.getKeys('')
      for (const key of items) {
        const item = await storage.getItem(key)
        if (item && typeof item.createdAt === 'string') {
          item.createdAt = new Date(item.createdAt)
          item.updatedAt = new Date(item.updatedAt || item.createdAt)
          await storage.setItem(key, item)
        }
      }
    },

    2: async (storage) => {
      // Add metadata to all items
      const items = await storage.getKeys('')
      for (const key of items) {
        const item = await storage.getItem(key)
        if (item && !item.metadata) {
          item.metadata = {
            version: 2,
            migrationDate: new Date(),
            checksum: generateChecksum(item)
          }
          await storage.setItem(key, item)
        }
      }
    }
  }
})
```

### Schema Restructuring

```typescript
const storage = createStorage({
  version: 3,
  migrations: {
    1: async (storage) => {
      // Flatten nested user data
      const users = await storage.getKeys('users:')
      for (const userKey of users) {
        const user = await storage.getItem(userKey)
        if (user && user.profile) {
          // Move profile data to top level
          const flatUser = {
            id: user.id,
            name: user.profile.name,
            email: user.profile.email,
            avatar: user.profile.avatar,
            settings: user.settings,
            createdAt: user.createdAt
          }
          await storage.setItem(userKey, flatUser)
        }
      }
    },

    2: async (storage) => {
      // Split configuration into categories
      const config = await storage.getItem('config')
      if (config) {
        await storage.setItem('config:ui', {
          theme: config.theme,
          layout: config.layout,
          sidebar: config.sidebar
        })
        await storage.setItem('config:app', {
          debug: config.debug,
          logging: config.logging,
          performance: config.performance
        })
        await storage.setItem('config:user', {
          language: config.language,
          timezone: config.timezone,
          notifications: config.notifications
        })
        await storage.removeItem('config')
      }
    },

    3: async (storage) => {
      // Add indices for faster lookups
      const users = await storage.getKeys('users:')
      const emailIndex = new Map()
      const nameIndex = new Map()

      for (const userKey of users) {
        const user = await storage.getItem(userKey)
        if (user) {
          emailIndex.set(user.email.toLowerCase(), userKey)
          nameIndex.set(user.name.toLowerCase(), userKey)
        }
      }

      await storage.setItem('indices:email', Object.fromEntries(emailIndex))
      await storage.setItem('indices:name', Object.fromEntries(nameIndex))
    }
  }
})
```

## Migration Hooks

Hooks provide powerful capabilities for backup, validation, and cleanup operations.

### Comprehensive Hook Example

```typescript
import { snapshot, restoreSnapshot } from 'electron-async-storage'

const storage = createStorage({
  version: 2,
  migrations: {
    1: async (storage) => {
      // Migration logic here
      await migrateToVersion1(storage)
    },
    2: async (storage) => {
      // Migration logic here
      await migrateToVersion2(storage)
    }
  },
  migrationHooks: {
    beforeMigration: async (fromVersion, toVersion, storage) => {
      console.log(`🔄 Starting migration: v${fromVersion} → v${toVersion}`)

      // Create backup before migration
      const backupData = await snapshot(storage, '')
      await storage._setItemInternal('__migration_backup__', {
        version: fromVersion,
        timestamp: new Date(),
        data: backupData
      })

      // Validate current state
      await validateStorageIntegrity(storage)

      // Log migration start
      await storage._setItemInternal('__migration_log__', [{
        event: 'migration_started',
        fromVersion,
        toVersion,
        timestamp: new Date()
      }])
    },

    afterMigration: async (fromVersion, toVersion, storage) => {
      console.log(`✅ Migration completed: v${fromVersion} → v${toVersion}`)

      // Validate migrated state
      await validateStorageIntegrity(storage)

      // Update migration log
      const log = await storage.getItem('__migration_log__') || []
      log.push({
        event: 'migration_completed',
        fromVersion,
        toVersion,
        timestamp: new Date()
      })
      await storage._setItemInternal('__migration_log__', log)

      // Clean up backup after successful migration
      await storage.removeItem('__migration_backup__')

      // Trigger post-migration optimizations
      await optimizeStorage(storage)
    },

    onMigrationError: async (error, fromVersion, toVersion, storage) => {
      console.error(`❌ Migration failed: v${fromVersion} → v${toVersion}`, error)

      // Log the error
      const log = await storage.getItem('__migration_log__') || []
      log.push({
        event: 'migration_failed',
        fromVersion,
        toVersion,
        error: error.message,
        stack: error.stack,
        timestamp: new Date()
      })
      await storage._setItemInternal('__migration_log__', log)

      // Attempt rollback from backup
      const backup = await storage.getItem('__migration_backup__')
      if (backup && backup.data) {
        console.log('🔄 Rolling back to previous state...')

        // Clear current state
        await storage.clear()

        // Restore from backup
        await restoreSnapshot(storage, backup.data)

        // Reset version
        await storage._setItemInternal('__storage_version__', backup.version)

        console.log('✅ Rollback completed')
      }

      // Re-throw error for handling by application
      throw error
    }
  }
})

async function validateStorageIntegrity(storage: Storage) {
  // Custom validation logic
  const requiredKeys = ['config:app', 'config:user']
  for (const key of requiredKeys) {
    const value = await storage.getItem(key)
    if (!value) {
      throw new Error(`Required key missing: ${key}`)
    }
  }
}

async function optimizeStorage(storage: Storage) {
  // Post-migration optimizations
  console.log('🔧 Optimizing storage...')

  // Rebuild indices
  await rebuildIndices(storage)

  // Compact data structures
  await compactData(storage)

  console.log('✅ Storage optimization completed')
}
```

## Error Handling and Rollback

### Advanced Error Recovery

```typescript
const storage = createStorage({
  version: 3,
  migrations: {
    1: async (storage) => {
      try {
        await riskyMigrationOperation(storage)
      } catch (error) {
        // Log specific migration step failure
        console.error('Migration step failed:', error)
        throw new Error(`Migration 1 failed at step: ${error.message}`)
      }
    },

    2: async (storage) => {
      // Multi-step migration with intermediate checkpoints
      await storage._setItemInternal('__migration_checkpoint__', 'step1')
      await migrationStep1(storage)

      await storage._setItemInternal('__migration_checkpoint__', 'step2')
      await migrationStep2(storage)

      await storage._setItemInternal('__migration_checkpoint__', 'step3')
      await migrationStep3(storage)

      // Clear checkpoint on success
      await storage.removeItem('__migration_checkpoint__')
    }
  },
  migrationHooks: {
    onMigrationError: async (error, fromVersion, toVersion, storage) => {
      // Check for partial migration state
      const checkpoint = await storage.getItem('__migration_checkpoint__')
      if (checkpoint) {
        console.log(`Migration failed at checkpoint: ${checkpoint}`)

        // Implement checkpoint-specific recovery
        await recoverFromCheckpoint(storage, checkpoint)
      }

      // Detailed error reporting
      await reportMigrationError(error, fromVersion, toVersion, {
        checkpoint,
        storageSize: await getStorageSize(storage),
        timestamp: new Date()
      })

      // Custom rollback strategy based on error type
      if (error.message.includes('disk_full')) {
        await cleanupTempData(storage)
        throw new Error('Migration failed: Insufficient disk space. Please free up space and retry.')
      } else if (error.message.includes('corruption')) {
        await attemptDataRecovery(storage)
        throw new Error('Migration failed: Data corruption detected. Recovery attempted.')
      } else {
        // Standard rollback
        await standardRollback(storage)
        throw error
      }
    }
  }
})
```

## Advanced Migration Patterns

### Conditional Migrations

```typescript
const storage = createStorage({
  version: 4,
  migrations: {
    1: async (storage) => {
      // Only migrate if specific conditions are met
      const userCount = (await storage.getKeys('users:')).length
      if (userCount > 1000) {
        console.log('Large user base detected, using optimized migration...')
        await largeBatchUserMigration(storage)
      } else {
        await standardUserMigration(storage)
      }
    },

    2: async (storage) => {
      // Conditional migration based on existing data
      const hasLegacyFormat = await storage.hasItem('legacy_config')
      if (hasLegacyFormat) {
        await migrateLegacyConfig(storage)
      }

      // Feature flag-based migration
      const features = await storage.getItem('app:features') || {}
      if (features.newUserSystem) {
        await migrateToNewUserSystem(storage)
      }
    },

    3: async (storage) => {
      // Environment-specific migration
      const environment = process.env.NODE_ENV
      if (environment === 'development') {
        await addDevelopmentData(storage)
      } else if (environment === 'production') {
        await optimizeForProduction(storage)
      }
    }
  }
})
```

### Parallel Data Migration

```typescript
const storage = createStorage({
  version: 2,
  migrations: {
    1: async (storage) => {
      // Migrate different data types in parallel
      await Promise.all([
        migrateUsers(storage),
        migrateSettings(storage),
        migrateCache(storage)
      ])
    },

    2: async (storage) => {
      // Process large datasets in chunks
      const batchSize = 100
      const allKeys = await storage.getKeys('')

      for (let i = 0; i < allKeys.length; i += batchSize) {
        const batch = allKeys.slice(i, i + batchSize)
        await Promise.all(
          batch.map(async (key) => {
            const item = await storage.getItem(key)
            if (item) {
              const migrated = await transformItem(item)
              await storage.setItem(key, migrated)
            }
          })
        )

        // Progress reporting
        console.log(`Migration progress: ${Math.min(i + batchSize, allKeys.length)}/${allKeys.length}`)
      }
    }
  }
})

async function migrateUsers(storage: Storage) {
  console.log('Migrating users...')
  const users = await storage.getKeys('users:')
  for (const userKey of users) {
    const user = await storage.getItem(userKey)
    if (user) {
      user.version = 1
      user.migratedAt = new Date()
      await storage.setItem(userKey, user)
    }
  }
}
```

### External Data Integration

```typescript
const storage = createStorage({
  version: 2,
  migrations: {
    1: async (storage) => {
      // Import data from external sources
      const externalData = await fetchExternalData()
      await storage.setItem('external:imported', {
        data: externalData,
        importedAt: new Date(),
        source: 'api-v2'
      })

      // Merge with existing data
      const existingConfig = await storage.getItem('config') || {}
      const mergedConfig = {
        ...existingConfig,
        ...externalData.config,
        merged: true
      }
      await storage.setItem('config', mergedConfig)
    },

    2: async (storage) => {
      // Export data for external backup
      const criticalData = await storage.getKeys('critical:')
      const backupData = {}

      for (const key of criticalData) {
        backupData[key] = await storage.getItem(key)
      }

      await exportToExternalBackup(backupData)
      await storage.setItem('backup:last_export', new Date())
    }
  }
})

async function fetchExternalData() {
  // Implement external data fetching
  const response = await fetch('/api/migration-data')
  return response.json()
}

async function exportToExternalBackup(data: any) {
  // Implement external backup export
  await fetch('/api/backup', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}
```

## Migration Testing

### Unit Test Example

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createStorage, snapshot, restoreSnapshot } from 'electron-async-storage'
import memoryDriver from 'electron-async-storage/drivers/memory'

describe('Storage Migrations', () => {
  let storage: Storage

  beforeEach(async () => {
    storage = createStorage({ driver: memoryDriver() })
  })

  it('should migrate from version 0 to version 2', async () => {
    // Setup initial data (version 0)
    await storage.setItem('settings', { theme: 'light' })
    await storage.setItem('user_data', { name: 'John' })

    // Create storage with migrations
    const migratedStorage = createStorage({
      driver: memoryDriver(),
      version: 2,
      migrations: {
        1: async (storage) => {
          const settings = await storage.getItem('settings')
          await storage.setItem('app:settings', settings)
          await storage.removeItem('settings')
        },
        2: async (storage) => {
          const userData = await storage.getItem('user_data')
          await storage.setItem('users:default', userData)
          await storage.removeItem('user_data')
        }
      }
    })

    // Restore initial data
    const initialData = await snapshot(storage, '')
    await restoreSnapshot(migratedStorage, initialData)

    // Run migrations
    await migratedStorage.migrate()

    // Verify migration results
    expect(await migratedStorage.getItem('app:settings')).toEqual({ theme: 'light' })
    expect(await migratedStorage.getItem('users:default')).toEqual({ name: 'John' })
    expect(await migratedStorage.hasItem('settings')).toBe(false)
    expect(await migratedStorage.hasItem('user_data')).toBe(false)
    expect(await migratedStorage.getStorageVersion()).toBe(2)
  })

  it('should handle migration errors gracefully', async () => {
    const storage = createStorage({
      driver: memoryDriver(),
      version: 1,
      migrations: {
        1: async () => {
          throw new Error('Migration failed')
        }
      },
      migrationHooks: {
        onMigrationError: async (error, from, to, storage) => {
          await storage._setItemInternal('migration_error', error.message)
        }
      }
    })

    await expect(storage.migrate()).rejects.toThrow('Migration failed')
    expect(await storage.getItem('migration_error')).toBe('Migration failed')
  })

  it('should skip unnecessary migrations', async () => {
    // Set up storage at version 3
    const storage = createStorage({
      driver: memoryDriver(),
      version: 5,
      migrations: {
        1: vi.fn(),
        2: vi.fn(),
        3: vi.fn(),
        4: vi.fn(),
        5: vi.fn()
      }
    })

    // Set current version to 3
    await storage._setItemInternal('__storage_version__', 3)

    await storage.migrate()

    // Should only run migrations 4 and 5
    expect(storage.migrations[1]).not.toHaveBeenCalled()
    expect(storage.migrations[2]).not.toHaveBeenCalled()
    expect(storage.migrations[3]).not.toHaveBeenCalled()
    expect(storage.migrations[4]).toHaveBeenCalled()
    expect(storage.migrations[5]).toHaveBeenCalled()
  })
})
```

### Integration Testing

```typescript
import { describe, it, expect } from 'vitest'
import { createStorage } from 'electron-async-storage'
import fsDriver from 'electron-async-storage/drivers/fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { rm } from 'fs/promises'

describe('File System Migration Integration', () => {
  const testDir = join(tmpdir(), 'storage-migration-test')

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('should persist migration state across restarts', async () => {
    // First run - create storage with migration
    let storage = createStorage({
      driver: fsDriver({ base: testDir }),
      version: 2,
      migrations: {
        1: async (storage) => {
          await storage.setItem('migrated:v1', true)
        },
        2: async (storage) => {
          await storage.setItem('migrated:v2', true)
        }
      }
    })

    await storage.setItem('initial-data', 'test')
    await storage.migrate()
    await storage.dispose()

    // Second run - recreate storage (simulates app restart)
    storage = createStorage({
      driver: fsDriver({ base: testDir }),
      version: 2,
      migrations: {
        1: async (storage) => {
          throw new Error('Should not run again')
        },
        2: async (storage) => {
          throw new Error('Should not run again')
        }
      }
    })

    // Should not run migrations again
    await expect(storage.migrate()).resolves.not.toThrow()

    // Verify migrated data persisted
    expect(await storage.getItem('migrated:v1')).toBe(true)
    expect(await storage.getItem('migrated:v2')).toBe(true)
    expect(await storage.getStorageVersion()).toBe(2)
  })
})
```

## Best Practices

### 1. Version Management

```typescript
// ✅ Good: Sequential version numbers
const storage = createStorage({
  version: 3,
  migrations: {
    1: migrateToV1,
    2: migrateToV2,
    3: migrateToV3
  }
})

// ❌ Bad: Non-sequential versions
const storage = createStorage({
  version: 10,
  migrations: {
    1: migrateToV1,
    5: migrateToV5,  // Gap in versions
    10: migrateToV10
  }
})
```

### 2. Data Safety

```typescript
// ✅ Good: Always backup before migration
migrationHooks: {
  beforeMigration: async (fromVersion, toVersion, storage) => {
    const backup = await snapshot(storage, '')
    await storage._setItemInternal('__backup__', backup)
  }
}

// ✅ Good: Validate data after migration
migrationHooks: {
  afterMigration: async (fromVersion, toVersion, storage) => {
    await validateMigrationResults(storage)
  }
}
```

### 3. Error Handling

```typescript
// ✅ Good: Specific error handling
migrations: {
  1: async (storage) => {
    try {
      await riskyOperation(storage)
    } catch (error) {
      // Provide context for debugging
      throw new Error(`Migration 1 failed: ${error.message}`)
    }
  }
}

// ✅ Good: Graceful degradation
migrationHooks: {
  onMigrationError: async (error, fromVersion, toVersion, storage) => {
    // Log error for debugging
    console.error('Migration failed:', error)

    // Attempt recovery
    await attemptRecovery(storage)

    // Provide helpful error message
    throw new Error(`Migration from v${fromVersion} to v${toVersion} failed. Please check logs and try again.`)
  }
}
```

### 4. Performance Considerations

```typescript
// ✅ Good: Batch operations for large datasets
migrations: {
  1: async (storage) => {
    const batchSize = 100
    const keys = await storage.getKeys('')

    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize)
      const items = await storage.getItems(batch)

      const migratedItems = items.map(({ key, value }) => ({
        key,
        value: migrateItem(value)
      }))

      await storage.setItems(migratedItems)
    }
  }
}

// ✅ Good: Progress reporting for long migrations
migrations: {
  1: async (storage) => {
    const totalItems = (await storage.getKeys('')).length
    let processed = 0

    // Process items...

    if (processed % 100 === 0) {
      console.log(`Migration progress: ${processed}/${totalItems}`)
    }
  }
}
```

### 5. Testing

```typescript
// ✅ Good: Test both successful and failed migrations
describe('Migrations', () => {
  it('should migrate successfully', async () => {
    // Test successful migration path
  })

  it('should handle migration errors', async () => {
    // Test error scenarios
  })

  it('should not re-run completed migrations', async () => {
    // Test idempotency
  })
})
```

This comprehensive migration guide provides all the tools and patterns needed to implement robust, safe, and maintainable data migrations in electron-async-storage applications.