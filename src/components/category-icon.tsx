import {
  Car,
  Gift,
  HeartPulse,
  House,
  ShoppingBag,
  Sparkles,
  Utensils,
  WalletCards,
} from "lucide-react";

const icons = {
  car: Car,
  gift: Gift,
  heart: HeartPulse,
  home: House,
  shopping: ShoppingBag,
  sparkles: Sparkles,
  utensils: Utensils,
  wallet: WalletCards,
};

export function CategoryIcon({ name, size = 18 }: { name?: string; size?: number }) {
  const Icon = icons[name as keyof typeof icons] ?? WalletCards;
  return <Icon size={size} strokeWidth={2} />;
}
