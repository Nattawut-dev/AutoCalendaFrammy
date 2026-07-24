import { MIN_SHIFT_CONFIDENCE } from "@/lib/constants";
import type { RosterAnalysis, RosterAudit, RosterWarning } from "@/lib/types";
import { cleanText } from "@/lib/utils/text";
import { daysInMonth } from "@/lib/utils/date";

function normalizeAuditCode(value: string): string {
  return cleanText(value).toUpperCase();
}

function auditWarning(
  code: string,
  message: string,
  date: string | null = null,
): RosterWarning {
  return { code, message, date };
}

export function applyIndependentAudit(
  roster: RosterAnalysis,
  audit: RosterAudit,
): RosterAnalysis {
  const warnings: RosterWarning[] = [];
  if (
    audit.employee !== roster.employee ||
    audit.month !== roster.month ||
    audit.year !== roster.year
  ) {
    warnings.push(
      auditWarning(
        "independent_metadata_mismatch",
        "ผลตรวจอิสระอ่านชื่อพนักงานหรือเดือนปีไม่ตรงกับผลหลัก",
      ),
    );
  }

  if (audit.printedOffCount !== roster.printedOffCount) {
    warnings.push(
      auditWarning(
        "independent_off_total_mismatch",
        `ผลหลักอ่านยอด OFF ${roster.printedOffCount ?? "ไม่ได้"} แต่ผลตรวจอิสระอ่านได้ ${audit.printedOffCount ?? "ไม่ได้"}`,
      ),
    );
  }

  const expectedDays = daysInMonth(roster.year, roster.month);
  const cellsByDay = new Map<number, RosterAudit["cells"][number]>();
  for (const cell of audit.cells) {
    if (cellsByDay.has(cell.day)) {
      warnings.push(
        auditWarning(
          "independent_duplicate_day",
          `ผลตรวจอิสระพบวันที่ ${cell.day} ซ้ำ`,
        ),
      );
    }
    cellsByDay.set(cell.day, cell);
  }
  if (audit.cells.length !== expectedDays || cellsByDay.size !== expectedDays) {
    warnings.push(
      auditWarning(
        "independent_day_count_mismatch",
        `ผลตรวจอิสระต้องมี ${expectedDays} วัน แต่พบ ${cellsByDay.size} วัน`,
      ),
    );
  }

  for (const shift of roster.shifts) {
    const day = Number(shift.date.slice(-2));
    const auditCell = cellsByDay.get(day);
    if (!auditCell) {
      warnings.push(
        auditWarning(
          "independent_missing_day",
          "ผลตรวจอิสระไม่พบข้อมูลวันที่นี้",
          shift.date,
        ),
      );
      continue;
    }
    const auditCode = normalizeAuditCode(auditCell.code);
    if (auditCode !== shift.code) {
      warnings.push(
        auditWarning(
          "independent_code_mismatch",
          `ผลหลักอ่าน ${shift.code} แต่ผลตรวจอิสระอ่าน ${auditCode}`,
          shift.date,
        ),
      );
    }
    if (auditCell.printedWeekday !== shift.printedWeekday) {
      warnings.push(
        auditWarning(
          "independent_weekday_mismatch",
          `ผลหลักอ่านหัววัน ${shift.printedWeekday ?? "ไม่ได้"} แต่ผลตรวจอิสระอ่าน ${auditCell.printedWeekday}`,
          shift.date,
        ),
      );
    }
    if (auditCell.confidence < MIN_SHIFT_CONFIDENCE) {
      warnings.push(
        auditWarning(
          "independent_low_confidence",
          `ผลตรวจอิสระมีความมั่นใจต่ำ (${auditCell.confidence.toFixed(2)})`,
          shift.date,
        ),
      );
    }
  }

  return {
    ...roster,
    warnings: [...roster.warnings, ...warnings],
  };
}
