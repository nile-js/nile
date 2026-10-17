import type { EngineStats } from "@/engine/types";

/** Keep sub-millisecond registration work readable without rounding stored measurements. */
export function formatRegistrationDuration(durationMs: number): string {
  return durationMs >= 1000
    ? `${(durationMs / 1000).toFixed(1)}s`
    : `${durationMs.toFixed(3)}ms`;
}

/** Print the same registration snapshot that backs the server's stats getter. */
export function printStartupStats(stats: EngineStats): void {
  console.table(
    stats.services.map((service) => ({
      Service: service.name,
      Description: service.description,
      Actions: service.actionCount,
      Registration: formatRegistrationDuration(service.registrationDurationMs),
    }))
  );
  const servicesLabel = stats.totalServices === 1 ? "service" : "services";
  const actionsLabel = stats.totalActions === 1 ? "action" : "actions";
  console.log(
    `Registered ${stats.totalServices} ${servicesLabel} and ${stats.totalActions} ${actionsLabel} in ${formatRegistrationDuration(stats.registrationDurationMs)}`
  );
}
