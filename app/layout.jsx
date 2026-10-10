import "./globals.css";
import { preload } from "react-dom";
import { Inter, DM_Serif_Display } from "next/font/google";
import { CartProvider } from "@/lib/cart";
import { WishlistProvider } from "@/lib/wishlist";
import CartDrawer from "@/components/CartDrawer";
import WishlistDrawer from "@/components/WishlistDrawer";
import CartToast from "@/components/CartToast";
import DemoPanelGate from "@/components/DemoPanelGate";
import ViewTransitionListener from "@/components/ViewTransitionListener";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});

const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dm-serif",
});

export const metadata = {
  title: "The Nuzz Story | Everything Your Pet Loves",
  description:
    "The Nuzz Story is a pet store for dogs and cats — toys, treats, cozy beds and everything your best friend loves.",
};

export default function RootLayout({ children }) {
  // Epilogue is the headline font on the landing page: fetch it early.
  preload("/fonts/Epilogue-VariableFont_wght.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  });

  return (
    <html lang="en" className={`${inter.variable} ${dmSerifDisplay.variable}`}>
      <body suppressHydrationWarning>
        <CartProvider>
          <WishlistProvider>
            {children}
            <CartDrawer />
            <WishlistDrawer />
            <CartToast />
            <DemoPanelGate />
            <ViewTransitionListener />
          </WishlistProvider>
        </CartProvider>
      </body>
    </html>
  );
}
