import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

interface InstalledPluginEntry {
  installPath: string;
  version: string;
}

interface InstalledPluginsFile {
  plugins: Record<string, InstalledPluginEntry[]>;
}

export interface PluginConfig {
  type: "local";
  path: string;
}

export function getInstalledPlugins(): PluginConfig[] {
  const pluginsPath = join(homedir(), ".claude", "plugins", "installed_plugins.json");

  if (!existsSync(pluginsPath)) {
    return [];
  }

  try {
    const content = readFileSync(pluginsPath, "utf-8");
    const data: InstalledPluginsFile = JSON.parse(content);

    const plugins: PluginConfig[] = [];
    for (const [_name, entries] of Object.entries(data.plugins)) {
      if (entries.length > 0) {
        plugins.push({ type: "local", path: entries[0].installPath });
      }
    }
    return plugins;
  } catch {
    return [];
  }
}
