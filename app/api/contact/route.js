import { NextResponse } from "next/server";

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  const name = (body.name || "").trim();
  const email = (body.email || "").trim();
  const message = (body.message || "").trim();

  const errors = {};
  if (name.length < 2) errors.name = "Please tell us your name.";
  if (!isEmail(email)) errors.email = "That email doesn't look right.";
  if (message.length < 10)
    errors.message = "A little more detail helps us help you.";

  // Topic-specific fields (the form only shows these for their topic).
  const orderNumber = (body.orderNumber || "").trim().toUpperCase();
  const company = (body.company || "").trim();
  if (body.topic === "order" && !/^CP-[A-Z0-9]{4,}$/.test(orderNumber))
    errors.orderNumber = "Order numbers start with CP- (it's on your receipt).";
  if (body.topic === "wholesale" && company.length < 2)
    errors.company = "Which shop or company is this for?";

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 422 });
  }

  console.log("[contact] new message", { name, email, topic: body.topic, orderNumber, company });

  const first = name.split(" ")[0];
  const replies = {
    order: `Thanks ${first}! We've pulled up ${orderNumber} and will reply within one business day.`,
    wholesale: `Thanks ${first}! Our wholesale team will get back to ${company} within two business days.`,
    hi: body.hasPhoto
      ? `Thanks ${first}! Best photo we've seen all day (don't tell Biscuit).`
      : `Thanks ${first}! Hi back from the whole pack.`,
  };
  return NextResponse.json({
    ok: true,
    message: replies[body.topic] ?? `Thanks ${first}! We'll bark back within one business day.`,
  });
}
