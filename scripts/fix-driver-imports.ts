import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

async function fixDriverTypeImports() {
  const driversOutputDir = fileURLToPath(
    new URL("../drivers", import.meta.url)
  );

  try {
    const dtsFiles = (await readdir(driversOutputDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".d.ts"))
      .map((entry) => entry.name);

    for (const file of dtsFiles) {
      const filePath = join(driversOutputDir, file);
      let content = await readFile(filePath, "utf8");

      // Replace '../types' imports with 'electron-async-storage' imports
      content = content.replace(
        /import type \{([^}]+)\} from ["']\.\.\/types["'];/g,
        'import type {$1} from "electron-async-storage";'
      );

      await writeFile(filePath, content, "utf8");
      console.log(`Fixed type imports in ${file}`);
    }

    console.log(`Fixed type imports in ${dtsFiles.length} driver files`);
  } catch (error) {
    console.error("Error fixing driver type imports:", error);
    throw error;
  }
}

// Run the fix
await fixDriverTypeImports();
