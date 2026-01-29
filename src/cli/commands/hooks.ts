/**
 * Webhook management commands
 */

import chalk from "chalk";
import { loadConfigSafe, configExists } from "../../config/loader.js";

export async function listHooks(): Promise<void> {
  if (!configExists()) {
    console.log(chalk.red("No config found. Run: ccb setup"));
    return;
  }

  const configResult = loadConfigSafe();
  if (!configResult.success) {
    console.log(chalk.red("Config error:"), configResult.error);
    return;
  }

  const config = configResult.config;

  if (!config.hooks?.enabled) {
    console.log(chalk.gray("Webhooks are not enabled."));
    return;
  }

  console.log(chalk.bold("\nConfigured Webhooks:\n"));
  console.log(chalk.gray(`  Server: ${config.hooks.bind}:${config.hooks.port}`));
  console.log();

  if (config.hooks.mappings.length === 0) {
    console.log(chalk.gray("  No webhook mappings configured."));
    console.log(chalk.gray("  Default mappings (gmail, github) will be used."));
  } else {
    for (const mapping of config.hooks.mappings) {
      console.log(chalk.bold(`  /${mapping.match.path}`));
      console.log(chalk.gray(`    Agent: ${mapping.agentId}`));
      if (mapping.match.event) {
        console.log(chalk.gray(`    Event: ${mapping.match.event}`));
      }
      if (mapping.deliver) {
        console.log(chalk.gray(`    Delivers to: ${mapping.deliver.channel}:${mapping.deliver.to}`));
      }
      console.log();
    }
  }
}

export async function showHookUrl(name: string): Promise<void> {
  if (!configExists()) {
    console.log(chalk.red("No config found. Run: ccb setup"));
    return;
  }

  const configResult = loadConfigSafe();
  if (!configResult.success) {
    console.log(chalk.red("Config error:"), configResult.error);
    return;
  }

  const config = configResult.config;

  if (!config.hooks?.enabled) {
    console.log(chalk.red("Webhooks are not enabled."));
    return;
  }

  const host = config.hooks.bind === "0.0.0.0" ? "localhost" : config.hooks.bind;
  const url = `http://${host}:${config.hooks.port}/hooks/${name}?token=${config.hooks.token}`;

  console.log(chalk.bold(`\nWebhook URL for '${name}':\n`));
  console.log(chalk.cyan(url));
  console.log();
  console.log(chalk.gray("Include the token in the URL or as X-Webhook-Token header."));
  console.log();
  console.log(chalk.bold("Example curl:"));
  console.log(chalk.gray(`  curl -X POST "${url}" \\`));
  console.log(chalk.gray(`    -H "Content-Type: application/json" \\`));
  console.log(chalk.gray(`    -d '{"test": "data"}'`));
}

export async function testHook(name: string, payloadJson?: string): Promise<void> {
  if (!configExists()) {
    console.log(chalk.red("No config found. Run: ccb setup"));
    return;
  }

  const configResult = loadConfigSafe();
  if (!configResult.success) {
    console.log(chalk.red("Config error:"), configResult.error);
    return;
  }

  const config = configResult.config;

  if (!config.hooks?.enabled) {
    console.log(chalk.red("Webhooks are not enabled."));
    return;
  }

  const host = config.hooks.bind === "0.0.0.0" ? "localhost" : config.hooks.bind;
  const url = `http://${host}:${config.hooks.port}/hooks/${name}`;

  let payload: unknown;
  if (payloadJson) {
    try {
      payload = JSON.parse(payloadJson);
    } catch {
      console.log(chalk.red("Invalid JSON payload."));
      return;
    }
  } else {
    // Default test payload
    payload = {
      test: true,
      timestamp: new Date().toISOString(),
      message: `Test webhook for ${name}`,
    };
  }

  console.log(chalk.cyan(`\nTesting webhook: ${name}\n`));
  console.log(chalk.gray(`URL: ${url}`));
  console.log(chalk.gray(`Payload: ${JSON.stringify(payload, null, 2)}`));
  console.log();

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.hooks.token) {
      headers["X-Webhook-Token"] = config.hooks.token;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (response.ok) {
      console.log(chalk.green("✓ Webhook processed successfully"));
      console.log(chalk.gray(`Response: ${JSON.stringify(result, null, 2)}`));
    } else {
      console.log(chalk.red(`✗ Webhook failed: ${response.status}`));
      console.log(chalk.gray(`Response: ${JSON.stringify(result, null, 2)}`));
    }
  } catch (error) {
    console.log(chalk.red(`✗ Connection failed: ${error instanceof Error ? error.message : String(error)}`));
    console.log(chalk.gray("Make sure the bridge is running: ccb start"));
  }
}
