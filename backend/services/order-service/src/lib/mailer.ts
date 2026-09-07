import nodemailer from "nodemailer";
import { config } from "../config.js";

// Gmail SMTP via nodemailer — EMAIL_PASS must be a Gmail App Password (Gmail
// rejects normal account passwords for SMTP AUTH once 2FA is on, which it
// requires to even generate an app password).
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: config.emailUser,
    pass: config.emailPass
  }
});

export interface ReceiptOrderItem {
  productName: string;
  variantTitle: string | null;
  quantity: number;
  unitPrice: string;
}

export interface ReceiptOrder {
  id: number;
  amount: string;
  razorpayPaymentId: string | null;
}

function formatRupees(amount: string | number): string {
  return `Rs. ${Number(amount).toFixed(2)}`;
}

function renderReceiptHtml(order: ReceiptOrder, items: ReceiptOrderItem[]): string {
  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee;">${item.productName}${item.variantTitle ? ` (${item.variantTitle})` : ""}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${formatRupees(item.unitPrice)}</td>
        </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2>Thank you for your order!</h2>
      <p>Your payment for order #${order.id} was successful.</p>
      ${order.razorpayPaymentId ? `<p style="color:#555;">Payment ID: ${order.razorpayPaymentId}</p>` : ""}
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <thead>
          <tr style="background:#f5f5f5;text-align:left;">
            <th style="padding:8px;">Item</th>
            <th style="padding:8px;text-align:center;">Qty</th>
            <th style="padding:8px;text-align:right;">Price</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td style="padding:8px;font-weight:bold;" colspan="2">Total</td>
            <td style="padding:8px;text-align:right;font-weight:bold;">${formatRupees(order.amount)}</td>
          </tr>
        </tfoot>
      </table>
      <p style="margin-top:24px;color:#888;font-size:12px;">This is an automated receipt from DumbBrew.</p>
    </div>`;
}

export async function sendReceiptEmail(to: string, order: ReceiptOrder, items: ReceiptOrderItem[]): Promise<void> {
  await transporter.sendMail({
    from: `"DumbBrew" <${config.emailUser}>`,
    to,
    subject: `Your DumbBrew receipt — Order #${order.id}`,
    html: renderReceiptHtml(order, items)
  });
}
