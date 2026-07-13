import type { LineMessage } from "@/lib/line/client";
import type { GeminiFailureReason } from "@/lib/errors";
import type { ValidationIssue } from "@/lib/types";
import { truncate } from "@/lib/utils/text";

export function textMessage(text: string): LineMessage {
  return { type: "text", text: truncate(text, 5000) };
}

export function createHelpMessage(): LineMessage {
  return textMessage(
    "วิธีใช้: ส่งภาพตารางเวรที่ชัดเจน 1 ภาพ โดยให้เห็นชื่อเดือน/ปี หัววันที่ แถว NANCHAYA ตาราง DETAILS และส่วน REMARK ครบถ้วน ระบบจะให้ตรวจสอบก่อนสร้างไฟล์ Calendar",
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
    `พบข้อมูลบางส่วนที่ต้องตรวจสอบ จึงยังไม่สร้าง Calendar:\n${details}\nกรุณาส่งรูปใหม่ที่คมชัดและให้เห็นแถว NANCHAYA, หัววันที่, DETAILS และ REMARK ครบถ้วน`,
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
          label: "เพิ่มเข้า Apple Calendar",
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

export function createRateLimitMessage(): LineMessage {
  return textMessage("ใช้งานครบจำนวนที่กำหนดชั่วคราว กรุณาลองใหม่ภายหลัง");
}

export function createGenericAnalysisErrorMessage(): LineMessage {
  return textMessage(
    "ไม่สามารถอ่านรูปนี้ได้ กรุณาส่งภาพที่ชัดขึ้นและให้เห็นแถว NANCHAYA, หัววันที่, DETAILS และ REMARK ครบถ้วน",
  );
}

export function createGeminiErrorMessage(
  reason: GeminiFailureReason,
): LineMessage {
  if (reason === "rate_limited") {
    return textMessage(
      "โควตาการวิเคราะห์รูปเต็มชั่วคราว กรุณารอสักครู่แล้วลองส่งรูปใหม่อีกครั้ง",
    );
  }
  if (reason === "authentication" || reason === "model_not_found") {
    return textMessage(
      "ระบบวิเคราะห์รูปยังตั้งค่าไม่สมบูรณ์ กรุณาตรวจสอบ GEMINI_API_KEY และ GEMINI_MODEL ใน Vercel",
    );
  }
  if (reason === "service_unavailable") {
    return textMessage(
      "บริการวิเคราะห์รูปไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่ภายหลัง",
    );
  }
  if (reason === "invalid_request") {
    return textMessage(
      "Gemini ไม่รับคำขอวิเคราะห์นี้ กรุณาตรวจชื่อโมเดล แล้วลองส่งภาพ JPEG หรือ PNG ที่มีขนาดเล็กลง",
    );
  }
  return createGenericAnalysisErrorMessage();
}
