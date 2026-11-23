import "./globals.css";
import { preload } from "react-dom";
import { Inter, DM_Serif_Display } from "next/font/google";
import { CartProvider } from "@/lib/cart";
import { WishlistProvider } from "@/lib/wishlist";
import { AccountProvider } from "@/lib/account";
import AccountDrawer from "@/components/AccountDrawer";
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
      <head>
        {/*
          A doubled slash in the address (thenuzzstory.com//admin/login) crashes the
          Next router: it reads "//admin/login" as another host. Netlify serves the
          page anyway (so middleware.ts never sees it), so tidy the address here,
          before the app starts. Inline and tiny on purpose.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var p=location.pathname;if(p.indexOf("//")>-1){history.replaceState(history.state,"",p.replace(/\\/{2,}/g,"/")+location.search+location.hash)}})()`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <CartProvider>
          <WishlistProvider>
            <AccountProvider>
            {children}
            <CartDrawer />
            <WishlistDrawer />
            <AccountDrawer />
            <CartToast />
            <DemoPanelGate />
            <ViewTransitionListener />
            </AccountProvider>
          </WishlistProvider>
        </CartProvider>
      </body>
    </html>
  );
}
