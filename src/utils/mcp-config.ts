// =============================================================================
// MCP Configuration Checker
// =============================================================================

import { invoke } from "../api/tauri";

const CLAUDE_CONFIG_FILENAME = ".claude.json";

interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface ClaudeConfig {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

export interface McpStatus {
  configExists: boolean;
  vividConfigured: boolean;
  vividPath: string | null;
  configPath: string;
}

/**
 * Get the home directory path
 */
async function getHomeDir(): Promise<string> {
  // Use environment variable via Tauri
  return invoke<string>("get_home_dir");
}

/**
 * Get the path to the Claude config file
 */
async function getClaudeConfigPath(): Promise<string> {
  const home = await getHomeDir();
  return `${home}/${CLAUDE_CONFIG_FILENAME}`;
}

/**
 * Check if MCP is configured for Vivid
 */
export async function checkMcpStatus(): Promise<McpStatus> {
  const configPath = await getClaudeConfigPath();

  const status: McpStatus = {
    configExists: false,
    vividConfigured: false,
    vividPath: null,
    configPath,
  };

  try {
    const content = await invoke<string>("read_file", { path: configPath });
    status.configExists = true;

    const config: ClaudeConfig = JSON.parse(content);

    if (config.mcpServers?.vivid) {
      status.vividConfigured = true;
      status.vividPath = config.mcpServers.vivid.command;
    }
  } catch {
    // File doesn't exist or couldn't be parsed
    status.configExists = false;
  }

  return status;
}

/**
 * Get the vivid executable path for MCP configuration
 */
export async function getVividExecutablePath(): Promise<string> {
  // Try to get the path from the Tauri backend
  try {
    const path = await invoke<string>("get_vivid_executable_path");
    if (path) return path;
  } catch {
    // Fall through to default
  }

  // Default to expecting vivid in PATH
  return "vivid";
}

/**
 * Configure MCP for Vivid in Claude config
 */
export async function configureMcp(vividPath?: string): Promise<boolean> {
  const configPath = await getClaudeConfigPath();
  const execPath = vividPath || await getVividExecutablePath();

  try {
    let config: ClaudeConfig = {};

    // Read existing config if it exists
    try {
      const content = await invoke<string>("read_file", { path: configPath });
      config = JSON.parse(content);
    } catch {
      // File doesn't exist, start fresh
    }

    // Ensure mcpServers object exists
    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    // Add vivid MCP server
    config.mcpServers.vivid = {
      command: execPath,
      args: ["mcp"],
    };

    // Write config back
    await invoke("write_file", {
      path: configPath,
      content: JSON.stringify(config, null, 2),
    });

    console.log("[MCP Config] Successfully configured vivid MCP server at:", execPath);
    return true;
  } catch (e) {
    console.error("[MCP Config] Error configuring MCP:", e);
    return false;
  }
}

/**
 * Remove vivid from MCP configuration
 */
export async function removeMcpConfig(): Promise<boolean> {
  const configPath = await getClaudeConfigPath();

  try {
    const content = await invoke<string>("read_file", { path: configPath });
    const config: ClaudeConfig = JSON.parse(content);

    if (config.mcpServers?.vivid) {
      delete config.mcpServers.vivid;
      await invoke("write_file", {
        path: configPath,
        content: JSON.stringify(config, null, 2),
      });
    }

    return true;
  } catch {
    // File doesn't exist or couldn't be modified
    return true;
  }
}
