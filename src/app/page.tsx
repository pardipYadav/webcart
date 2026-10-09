import { HomeScreen } from "@/components/home-screen";
import { getCartStatus } from "@/lib/cart-status";
import { getDailyHealthMessage, getMenu } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [menu, status, health] = await Promise.all([getMenu(), getCartStatus(), getDailyHealthMessage()]);
  return <HomeScreen menu={menu} status={status} health={health} />;
}
