const steps = [
  "เพิ่มบอตเป็นเพื่อนใน LINE",
  "ส่งภาพตารางเวรที่เห็นชื่อเดือน/ปี หัววันที่ แถว NANCHAYA, DETAILS และ REMARK ชัดเจน",
  "ตรวจสอบรายการทุกวันและกิจกรรมพิเศษในข้อความตัวอย่าง",
  "กดยืนยัน แล้วเปิดลิงก์เพื่อนำไฟล์เข้า Apple Calendar บน iPhone",
];

export function SetupGuide() {
  return (
    <main>
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">PERSONAL LINE BOT</p>
        <h1 id="page-title">ตารางเวร สู่ Apple Calendar</h1>
        <p className="lead">
          ส่งภาพตารางเวรทาง LINE ระบบจะอ่านเฉพาะแถว <strong>NANCHAYA</strong>
          แล้วสร้างไฟล์ Calendar หลังจากคุณตรวจสอบและยืนยันเท่านั้น
        </p>
        <div className="status" role="status">
          <span aria-hidden="true" /> พร้อมรับภาพผ่าน LINE Webhook
        </div>
      </section>

      <section className="panel" aria-labelledby="how-to-use">
        <h2 id="how-to-use">วิธีใช้งาน</h2>
        <ol>
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="grid" aria-label="ข้อมูลสำคัญ">
        <article className="card">
          <h2>ตรวจสอบก่อนนำเข้า</h2>
          <p>
            ระบบแสดงกะ วัน OFF และกิจกรรมจาก REMARK ครบถ้วนก่อนสร้างไฟล์
            หากข้อมูลไม่ชัด จะขอให้ส่งภาพใหม่แทนการเดา
          </p>
        </article>
        <article className="card">
          <h2>รองรับกิจกรรมซ้อน</h2>
          <p>
            Training หรือกิจกรรมพิเศษสามารถซ้อนกับกะทำงานได้
            โดยกะทำงานจะไม่ถูกตัด ลดเวลา หรือรวมกับกิจกรรม
          </p>
        </article>
        <article className="card">
          <h2>ลิงก์มีอายุจำกัด</h2>
          <p>
            งานชั่วคราวหมดอายุภายใน 30 นาที และลิงก์ดาวน์โหลดมีอายุ 15 นาที
            เพื่อจำกัดการเข้าถึงข้อมูล
          </p>
        </article>
      </section>

      <aside className="privacy" aria-labelledby="privacy-title">
        <h2 id="privacy-title">ความเป็นส่วนตัว</h2>
        <p>
          ภาพถูกส่งไปวิเคราะห์ชั่วคราวและไม่ได้ตั้งใจจัดเก็บไว้
          ข้อมูลตารางที่ผ่านการตรวจสอบถูกเก็บใน Redis ชั่วคราวเท่านั้น
        </p>
      </aside>
    </main>
  );
}
