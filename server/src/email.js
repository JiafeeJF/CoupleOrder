import nodemailer from 'nodemailer';

let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE) === 'true' || process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    // 未配置 SMTP 时打印到控制台，方便本地调试
    console.log('\n========== [CoupleOrder 邮件通知] ==========');
    console.log(`收件人: ${to}`);
    console.log(`主题: ${subject}`);
    console.log('--------------------------------------------');
    console.log(text || html);
    console.log('============================================\n');
    return;
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'CoupleOrder <noreply@example.com>',
      to,
      subject,
      html,
      text,
    });
    console.log('[mail] 邮件已发送 ->', to);
  } catch (e) {
    console.error('[mail] 邮件发送失败:', e.message);
  }
}

function formatItems(items) {
  return items.map((it) => `${it.name} × ${it.quantity}（¥${(it.price * it.quantity).toFixed(2)}）`).join('\n');
}

function total(items) {
  return items.reduce((s, it) => s + it.price * it.quantity, 0);
}

export function buildOrderCompletedEmail(order) {
  const date = new Date(order.updatedAt || order.createdAt);
  const time = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const totalAmount = total(order.items).toFixed(2);
  const lines = [
    `亲爱的，你的订单 #${order.id} 已完成！`,
    '',
    `完成时间：${time}`,
    '',
    '订单明细：',
    formatItems(order.items),
    '',
    `合计：¥${totalAmount}`,
    '',
    '快去 CoupleOrder 看看吧～',
  ];
  const text = lines.join('\\n');
  const html = `
  <div style="font-family:'PingFang SC','Microsoft YaHei',sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#FFF7F9;border-radius:16px;">
    <div style="font-size:18px;font-weight:700;color:#E091A3;margin-bottom:12px;">订单已完成</div>
    <div style="color:#5C4A4E;line-height:1.8;">
      <p style="margin:0 0 12px;">亲爱的，你的订单 <b>#${order.id}</b> 已完成！</p>
      <p style="margin:0 0 4px;color:#8C7A7E;">完成时间：${time}</p>
      <div style="background:#fff;border-radius:12px;padding:14px 16px;margin:12px 0;">
        ${order.items.map((it) => `<div style="padding:4px 0;">${it.name} × ${it.quantity}　<span style="color:#E091A3;">¥${(it.price * it.quantity).toFixed(2)}</span></div>`).join('')}
        <div style="padding:6px 0 0;border-top:1px dashed #F7ECEF;margin-top:6px;font-weight:700;">合计：¥${totalAmount}</div>
      </div>
      <p style="margin-top:14px;color:#8C7A7E;">快去 CoupleOrder 看看吧～</p>
    </div>
  </div>`;
  return { text, html };
}

export function buildOrderEmail(order) {
  const date = new Date(order.createdAt);
  const time = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  const lines = [
    `亲爱的，${order.placedByName} 刚刚在 CoupleOrder 上为你点了一单！`,
    '',
    `下单时间：${time}`,
    '',
    '订单明细：',
    formatItems(order.items),
    '',
    `合计：¥${total(order.items).toFixed(2)}`,
  ];
  if (order.note) lines.push('', `备注：${order.note}`);
  lines.push('', '快去接单页面看看，为 TA 准备这份心意吧～');

  const text = lines.join('\n');
  const html = `
  <div style="font-family:'PingFang SC','Microsoft YaHei',sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#FFF8F0;border-radius:16px;">
    <div style="font-size:18px;font-weight:700;color:#E8604C;margin-bottom:12px;">你的TA点餐啦</div>
    <div style="color:#7A5C4F;line-height:1.8;">
      <p style="margin:0 0 12px;">亲爱的，${order.placedByName} 刚刚为你点了一单：</p>
      <p style="margin:0 0 4px;color:#A68A7D;">下单时间：${time}</p>
      <div style="background:#fff;border-radius:12px;padding:14px 16px;margin:12px 0;">
        ${order.items
          .map((it) => `<div style="padding:4px 0;">${it.name} × ${it.quantity}　<span style="color:#E8604C;">¥${(it.price * it.quantity).toFixed(2)}</span></div>`)
          .join('')}
        <div style="padding:6px 0 0;border-top:1px dashed #F2D8C8;margin-top:6px;font-weight:700;">合计：¥${total(order.items).toFixed(2)}</div>
      </div>
      ${order.note ? `<p style="margin:4px 0;color:#A68A7D;">备注：${order.note}</p>` : ''}
      <p style="margin-top:14px;color:#7A5C4F;">快去接单页面看看，为 TA 准备这份心意吧～</p>
    </div>
  </div>`;

  return { text, html };
}
