import { createPriceFormatter } from "@/lib/money";

/**
 * Grooming is priced in rupees from the store's printed menu, whatever money
 * profile the shop build uses (the e2e build prices demo products in USD).
 */
export const formatRupees = createPriceFormatter("INR");
