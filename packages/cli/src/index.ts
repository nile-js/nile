#!/usr/bin/env node
import { Command } from "commander";
import { generateActionCommand } from "./commands/generate-action.js";
import { generateSchemaCommand } from "./commands/generate-schema.js";
import { generateServiceCommand } from "./commands/generate-service.js";
import { newCommand } from "./commands/new.js";

const program = new Command();

program
  .name("nile")
  .description("CLI for the Nile backend framework")
  .version("0.0.1");

program
  .command("new")
  .argument("<project-name>", "Name of the project to create")
  .description("Scaffold a new Nile project")
  .action(newCommand);

const generate = program
  .command("generate")
  .alias("g")
  .description("Generate services and actions");

generate
  .command("service")
  .argument("<name>", "Service name (kebab-case recommended)")
  .description("Generate a new service with a demo action")
  .action(generateServiceCommand);

generate
  .command("action")
  .argument("<service-name>", "Name of the existing service")
  .argument("<action-name>", "Name of the action to create")
  .description("Generate a new action in an existing service")
  .action(generateActionCommand);

generate
  .command("schema")
  .option("-e, --entry <path>", "Path to services config file")
  .option("-o, --output <path>", "Output directory for generated files")
  .description(
    "Generate Zod schemas and TypeScript types from action validations"
  )
  .action(generateSchemaCommand);

program.parse();
