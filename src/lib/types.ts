export type Ingredient = {
  id: string;
  name: string;
  /** Selected when the page opens and included in the base price. */
  included: boolean;
  /** Optional topping. "All available toppings" toggles these. */
  optional: boolean;
  /** Added to the total when selected. Included ingredients stay at 0. */
  price: number;
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

export type PublicOrder = {
  orderId: string;
  customerName: string;
  mobile: string;
  productName: string;
  ingredients: string[];
  instructions: string;
  pickupLabel: string;
  total: number;
  dateLabel: string;
  timeLabel: string;
};

export type OrderResponse = {
  order: PublicOrder;
  whatsapp: {
    sent: boolean;
    manualUrl: string | null;
  };
};

export const ORDER_STORAGE_KEY = "traverso-last-order";
