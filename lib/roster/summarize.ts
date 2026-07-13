import type { RosterAnalysis } from "@/lib/types";

export function summarizeRoster(roster: RosterAnalysis) {
  const offDays = roster.shifts.filter((shift) => shift.isDayOff).length;
  return {
    workDays: roster.shifts.length - offDays,
    offDays,
    specialEvents: roster.specialEvents.length,
  };
}
