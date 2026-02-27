import type { Service } from "./types";

/**
 * Typed identity for defining a service with full type inference.
 * No runtime overhead — returns the config object as-is.
 */
export function createService(config: Service): Service {
  return config;
}

/**
 * Typed identity for defining multiple services with full type inference.
 * No runtime overhead — returns the config array as-is.
 */
export function createServices(configs: Service[]): Service[] {
  return configs;
}
