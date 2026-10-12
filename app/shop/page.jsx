import { Suspense } from "react";
import ShopPage from "@/components/ShopPage";

export const metadata = {
  title: "Shop — The Nuzz Story",
  description:
    "Shop toys, treats, cozy beds and everything else your dog or cat loves at The Nuzz Story.",
};

export default function Shop() {
  return (
    <Suspense fallback={<div className="shop-page cozy-page" />}>
      <ShopPage />
    </Suspense>
  );
}
