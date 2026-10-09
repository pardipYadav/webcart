import { formatInr } from "@/lib/money";

export type OrderMessageInput = {
  orderId: string;
  customerName: string;
  mobile: string;
  productName: string;
  ingredients: { name: string }[];
  instructions: string;
  quantity: number;
  total: number;
  dateLabel: string;
  timeLabel: string;
  payeeName?: string;
  upiId?: string;
  verifyUrl?: string;
  paymentReference?: string;
};

function idOf(orderId: string) {
  return orderId.replace(/^#/, "");
}

function paymentLines(order: OrderMessageInput) {
  const amount = formatInr(order.total);
  const lines = ["Payment: Google Pay", `Amount: ${amount}`];
  if (order.payeeName) lines.push(`Payee: ${order.payeeName}`);
  if (order.upiId) lines.push(`UPI ID: ${order.upiId}`);
  return lines;
}

export function buildWhatsAppMessage(order: OrderMessageInput) {
  const instructions = order.instructions.trim() || "None";
  const ingredients = order.ingredients.map((ingredient) => ingredient.name).join(", ");
  const lines = [
    "*New Breakfast Order*",
    "",
    `Order ID: #${idOf(order.orderId)}`,
    "Status: Pending Payment",
    `Customer Name: ${order.customerName}`,
    `Mobile Number: ${order.mobile}`,
    `Product: ${order.productName}`,
    `Quantity: ${order.quantity}`,
    `Ingredients: ${ingredients}`,
    `Special Instructions: ${instructions}`,
    `Total: ${formatInr(order.total)}`,
    `Order Date: ${order.dateLabel}`,
    `Order Time: ${order.timeLabel}`,
    "",
    ...paymentLines(order),
    "",
    "Please prepare this order after the payment is verified.",
  ];
  if (order.verifyUrl) lines.push("", `Verify payment: ${order.verifyUrl}`);
  return lines.join("\n");
}

export function buildPaymentMessage(order: OrderMessageInput) {
  return [
    "*Payment reference received*",
    "",
    `Order ID: #${idOf(order.orderId)}`,
    "Status: Pending Payment",
    `Customer Name: ${order.customerName}`,
    `Mobile Number: ${order.mobile}`,
    `Product: ${order.productName}`,
    `Quantity: ${order.quantity}`,
    `Total: ${formatInr(order.total)}`,
    `Transaction reference: ${order.paymentReference || "None"}`,
    "",
    "Please check this payment on Google Pay before confirming the order.",
  ].join("\n");
}

export function buildConfirmationMessage(order: OrderMessageInput) {
  const ingredients = order.ingredients.map((ingredient) => ingredient.name).join(", ");
  return [
    "*Order confirmed*",
    "",
    `Order ID: #${idOf(order.orderId)}`,
    "Status: Confirmed",
    `Customer Name: ${order.customerName}`,
    `Mobile Number: ${order.mobile}`,
    `Product: ${order.productName}`,
    `Quantity: ${order.quantity}`,
    `Ingredients: ${ingredients}`,
    `Total: ${formatInr(order.total)}`,
    `Transaction reference: ${order.paymentReference || "None"}`,
    "",
    "The payment is verified. Please prepare this order.",
  ].join("\n");
}
