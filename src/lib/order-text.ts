export type OrderMessageInput = {
  orderId: string;
  customerName: string;
  mobile: string;
  productName: string;
  ingredients: { name: string }[];
  instructions: string;
  dateLabel: string;
  timeLabel: string;
  pickupLabel: string;
};

export function buildWhatsAppMessage(order: OrderMessageInput) {
  const instructions = order.instructions.trim() || "None";
  const ingredients = order.ingredients.map((ingredient) => ingredient.name).join(", ");
  return [
    "*New Breakfast Order*",
    "",
    `Order ID: #${order.orderId.replace(/^#/, "")}`,
    `Customer Name: ${order.customerName}`,
    `Mobile Number: ${order.mobile}`,
    `Product: ${order.productName}`,
    `Ingredients: ${ingredients}`,
    `Special Instructions: ${instructions}`,
    `Order Date: ${order.dateLabel}`,
    `Order Time: ${order.timeLabel}`,
    `Pickup: ${order.pickupLabel}`,
    "",
    "Please prepare this order.",
  ].join("\n");
}
