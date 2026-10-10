export type Ingredient = {
  id: string;
  name: string;
  /** Selected when the page opens and included in the base price. */
  included: boolean;
  /** Optional topping. "All available toppings" toggles these. */
  optional: boolean;
  /** Added to the total when selected. Included ingredients stay at 0. */
  price: number;
  /** Stays selected. The customer cannot turn it off. */
  locked?: boolean;
};

export type Product = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  baseLabel: string;
  basePrice: number;
  image: string;
  imageAlt: string;
  accent: "green" | "gold";
  ingredients: Ingredient[];
};

export type CartStatus = {
  open: boolean;
  hoursLabel: string;
  closedMessage: string;
  prepMinutes: number;
};

export type HealthNote = {
  date: string;
  text: string;
};

export type OrderStatus = "pending_payment" | "confirmed";

export type UpiAppId = "gpay" | "phonepe" | "paytm";

export type UpiAppLink = {
  id: UpiAppId;
  name: string;
  androidUrl: string;
  iosUrl: string;
};

export type PaymentDetails = {
  payeeName: string;
  upiId: string;
  upiUrl: string;
  gpayUrl: string;
  apps: UpiAppLink[];
  qrDataUrl: string;
};

export type PublicOrder = {
  orderId: string;
  customerName: string;
  mobile: string;
  productName: string;
  ingredients: string[];
  instructions: string;
  quantity: number;
  total: number;
  status: OrderStatus;
  paymentReference: string;
  payment: PaymentDetails | null;
  dateLabel: string;
  timeLabel: string;
};

export type DeskOrder = {
  orderId: string;
  customerName: string;
  mobile: string;
  productName: string;
  ingredients: string[];
  instructions: string;
  quantity: number;
  total: number;
  status: OrderStatus;
  paymentReference: string;
  dateLabel: string;
  timeLabel: string;
};

export type GatewayCheckout = {
  keyId: string;
  orderId: string;
  amountPaise: number;
};

export type OrderResponse = {
  order: PublicOrder;
  accessToken: string;
  checkout: GatewayCheckout | null;
  paymentClaim: string;
  whatsapp: {
    sent: boolean;
    manualUrl: string | null;
    orderPhone: string;
  };
  paymentWhatsapp: {
    sent: boolean;
    manualUrl: string | null;
  } | null;
};

export const ORDER_STORAGE_KEY = "traverso-last-order";
