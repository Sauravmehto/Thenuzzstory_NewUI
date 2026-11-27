import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi } from "@/lib/server/admin-auth";
import { storeNow } from "@/lib/grooming/availability";
import { HOLDS_CAPACITY, type BookingStatus } from "@/lib/grooming/types";
import { listBookings } from "@/lib/server/grooming-bookings";
import { groomingStore } from "@/lib/server/grooming-store";
import { ORDER_STATUS_LABEL, type SavedOrder } from "@/lib/order-types";
import { orderStore } from "@/lib/server/order-store";
import type { OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];
const BOOKING_STATUSES: BookingStatus[] = ["pending_confirmation", "confirmed", "completed", "cancelled", "rejected"];

const isOrderSale = (status: OrderStatus) => status !== "cancelled";
const isBookingSale = (status: BookingStatus) => HOLDS_CAPACITY.includes(status);

const createdOn = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata" }).format(new Date(iso));

function statusCounts<K extends string>(rows: readonly { status: K }[], statuses: readonly K[]) {
  return Object.fromEntries(statuses.map((status) => [status, rows.filter((row) => row.status === status).length])) as Record<K, number>;
}

function sumOrderSales(rows: SavedOrder[]) {
  return rows.filter((row) => isOrderSale(row.status)).reduce((sum, row) => sum + row.totalCents, 0);
}

/** Orders + grooming KPIs for the admin dashboard. */
export async function GET(req: NextRequest) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  try {
    const today = storeNow().date;
    const [orders, bookings] = await Promise.all([(await orderStore()).list(), listBookings(await groomingStore())]);

    const ordersToday = orders.filter((order) => createdOn(order.createdAt) === today);
    const bookingsToday = bookings.filter((booking) => booking.appointment.date === today);
    const bookingsTodayLive = bookingsToday.filter((booking) => HOLDS_CAPACITY.includes(booking.status));

    const orderStatus = statusCounts(orders, ORDER_STATUSES);
    const bookingStatus = statusCounts(bookings, BOOKING_STATUSES);

    const orderSalesTotalCents = sumOrderSales(orders);
    const orderSalesTodayCents = sumOrderSales(ordersToday);

    const bookingSalesTotalCents = bookings
      .filter((booking) => isBookingSale(booking.status))
      .reduce((sum, booking) => sum + (booking.estimate?.totalCents ?? 0), 0);
    const bookingSalesTodayCents = bookingsTodayLive.reduce((sum, booking) => sum + (booking.estimate?.totalCents ?? 0), 0);

    return NextResponse.json(
      {
        ok: true,
        today,
        overview: {
          pendingActions: orderStatus.pending_confirmation + bookingStatus.pending_confirmation,
          todaySalesCents: orderSalesTodayCents + bookingSalesTodayCents,
          totalSalesCents: orderSalesTotalCents + bookingSalesTotalCents,
        },
        orders: {
          total: orders.length,
          today: ordersToday.length,
          pending: orderStatus.pending_confirmation,
          status: orderStatus,
          salesTotalCents: orderSalesTotalCents,
          salesTodayCents: orderSalesTodayCents,
          recent: orders.slice(0, 8),
        },
        grooming: {
          total: bookings.length,
          today: bookingsToday.length,
          pending: bookingStatus.pending_confirmation,
          status: bookingStatus,
          salesTotalCents: bookingSalesTotalCents,
          salesTodayCents: bookingSalesTodayCents,
          recent: bookings.slice(0, 8),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[admin/dashboard] load failed", err);
    return NextResponse.json({ ok: false, code: "storage_failed", message: "Couldn't load dashboard data." }, { status: 503 });
  }
}
