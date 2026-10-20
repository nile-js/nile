import type { JobSchedule, ScheduleDuration, Weekday } from "./types";

const DURATION = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/;
const TIME = /^(\d{2}):(\d{2})$/;
const OFFSET = /(Z|[+-]\d{2}:\d{2})$/;
const UNITS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
const DAYS: Record<Weekday, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** Convert readable elapsed durations to bounded timer values. */
export function parseDuration(duration: ScheduleDuration | number): number {
  const match = typeof duration === "string" ? DURATION.exec(duration) : null;
  let value = Number.NaN;
  if (typeof duration === "number") {
    value = duration;
  } else if (match) {
    value = Number(match[1]) * UNITS[match[2] as keyof typeof UNITS];
  }
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
    throw new Error(
      "Interval must be a positive duration no longer than 2147483647ms"
    );
  }
  return value;
}

function parseTime(at: string): { hour: number; minute: number } {
  const match = TIME.exec(at);
  const hour = Number(match?.[1]);
  const minute = Number(match?.[2]);
  if (!match || hour > 23 || minute > 59) {
    throw new Error("Schedule time must be HH:mm");
  }
  return { hour, minute };
}

/** Calendar presets share Croner's timezone behavior; intervals use elapsed completion-based delays. */
export function normalizeSchedule(
  schedule: JobSchedule
):
  | { kind: "interval"; delayMs: number }
  | { kind: "calendar"; pattern: string | Date; timezone: string } {
  if ("every" in schedule) {
    return { kind: "interval", delayMs: parseDuration(schedule.every) };
  }
  if ("once" in schedule) {
    if (typeof schedule.once === "string" && !OFFSET.test(schedule.once)) {
      throw new Error("One-time schedules require an explicit UTC offset or Z");
    }
    const date = new Date(schedule.once);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
      throw new Error("One-time schedules must be a valid future instant");
    }
    return { kind: "calendar", pattern: date, timezone: "UTC" };
  }
  const timezone = schedule.timezone ?? "UTC";
  // Intl validates IANA names before a timer or external job can be created.
  new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  if ("cron" in schedule) {
    return { kind: "calendar", pattern: schedule.cron, timezone };
  }
  const at = "midnight" in schedule ? "00:00" : (schedule.at ?? "00:00");
  const { hour, minute } = parseTime(at);
  const weekday = "weekly" in schedule ? DAYS[schedule.weekly] : "*";
  if (weekday === undefined) {
    throw new Error("Invalid schedule weekday");
  }
  return {
    kind: "calendar",
    pattern: `${minute} ${hour} * * ${weekday}`,
    timezone,
  };
}
