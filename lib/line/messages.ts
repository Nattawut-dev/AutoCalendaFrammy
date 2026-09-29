import type { LineMessage } from "@/lib/line/client";
import type { GeminiFailureReason } from "@/lib/errors";
import type { ValidationIssue } from "@/lib/types";
import { truncate } from "@/lib/utils/text";
import { MANUAL_ROSTER_EXAMPLE } from "@/lib/roster/parse-text";

export function textMessage(text: string): LineMessage {
  return { type: "text", text: truncate(text, 5000) };
}

export function createHelpMessage(): LineMessage {
  return textMessage(
    "ส่งภาพตารางเวรที่เห็นเดือน/ปี หัววันที่ และแถว NANCHAYA หรือพิมพ์ ‘ตาราง’ เพื่อส่งรหัสกะเป็นข้อความโดยไม่ต้องวิเคราะห์ภาพ ทั้งสองแบบจะแสดงตารางให้ตรวจและยืนยันก่อนสร้าง Calendar",
  );
}

export function createManualRosterHelpMessage(): LineMessage {
  return textMessage(
    `ส่งเดือน ปี และยอด OFF ตามด้วยรหัสกะครบทุกวันเรียงจากวันที่ 1 (เว้นวรรค ขึ้นบรรทัดใหม่ หรือคั่นด้วย comma ได้) รองรับปี ค.ศ. และ พ.ศ.\n\nตัวอย่างเดือนตุลาคม 2026:\n${MANUAL_ROSTER_EXAMPLE}\n\nหรือใช้รายการรายวันแบบเดิมให้ครบเดือน เช่น\n1 ต.ค. — 🤎 L8 — 12:00–21:00 (เข้ากับ: MINTRA [L8])\n2 ต.ค. — OFF\nสามารถระบุสถานะ เช่น L8 · 🎀 SHIFT CHANGE\n\nเพิ่มกิจกรรมแยกท้ายข้อความได้ เช่น\nREMARK 6-7 09:00-13:00 TRAINING\n(เวลาเป็นตัวอย่าง ต้องแก้ให้ตรงจริง)\nREMARK แยกจากกะเสมอ แม้เวลาซ้อนกัน ไม่เดาเวลาหรือเพื่อนร่วมงานที่ไม่ได้ระบุ วัน OFF ไม่สร้าง event แต่ REMARK ในวันนั้นยังสร้างได้\nตรวจวันและเวลาก่อนยืนยัน หากต้องแก้ให้ยกเลิกงานเดิมแล้วส่งข้อความทั้งเดือนใหม่`,
  );
}

export function createReviewRequiredMessage(
  issues: ValidationIssue[],
): LineMessage {
  const details = issues
    .slice(0, 20)
    .map((issue) => `${issue.date ? `${issue.date}: ` : ""}${issue.message}`)
    .join("\n");
  return textMessage(
    `พบข้อมูลบางส่วนที่ต้องตรวจสอบ จึงยังไม่สร้าง Calendar:\n${details}\nกรุณาส่งรูปใหม่ที่คมชัดและให้เห็นแถว NANCHAYA และหัววันที่ครบถ้วน (ไม่จำเป็นต้องมีตาราง DETAILS)`,
  );
}

export function createCalendarReadyMessage(url: string): LineMessage {
  return {
    type: "template",
    altText: "ไฟล์ Apple Calendar พร้อมดาวน์โหลด",
    template: {
      type: "buttons",
      text: "ไฟล์ Calendar พร้อมแล้ว ลิงก์ดาวน์โหลดมีอายุ 15 นาที",
      actions: [
        {
          type: "uri",
          label: "เพิ่มใน Calendar",
          uri: url,
        },
      ],
    },
  };
}

export function createCalendarUrlFallback(url: string): LineMessage {
  return textMessage(`หากปุ่มเปิดไม่ได้ ใช้ลิงก์นี้:\n${url}`);
}

export function createUnauthorizedMessage(): LineMessage {
  return textMessage("บัญชี LINE นี้ไม่ได้รับอนุญาตให้ใช้งานบอต");
}

export function createGenericAnalysisErrorMessage(): LineMessage {
  return textMessage(
    "ไม่สามารถอ่านรูปนี้ได้ กรุณาส่งภาพที่ชัดขึ้นและให้เห็นแถว NANCHAYA และหัววันที่ครบถ้วน",
  );
}

export function createGeminiErrorMessage(
  reason: GeminiFailureReason,
): LineMessage {
  if (reason === "rate_limited") {
    return textMessage(
      "โควตาการวิเคราะห์รูปเต็มชั่วคราว พิมพ์ ‘ตาราง’ เพื่อสร้าง Calendar จากรหัสกะเป็นข้อความได้",
    );
  }
  if (reason === "authentication" || reason === "model_not_found") {
    return textMessage(
      "ระบบวิเคราะห์รูปยังตั้งค่าไม่สมบูรณ์ กรุณาตรวจสอบ GEMINI_API_KEY และ GEMINI_MODEL ใน Vercel",
    );
  }
  if (reason === "service_unavailable") {
    return textMessage(
      "บริการวิเคราะห์รูปไม่พร้อมใช้งานชั่วคราว พิมพ์ ‘ตาราง’ เพื่อสร้าง Calendar จากรหัสกะเป็นข้อความได้",
    );
  }
  if (reason === "invalid_request") {
    return textMessage(
      "Gemini ไม่รับคำขอวิเคราะห์นี้ กรุณาตรวจชื่อโมเดล แล้วลองส่งภาพ JPEG หรือ PNG ที่มีขนาดเล็กลง",
    );
  }
  return createGenericAnalysisErrorMessage();
}
