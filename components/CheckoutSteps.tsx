import { IconCheck } from "@/components/icons";

const STEPS = [
  { id: "cart", label: "cart" },
  { id: "details", label: "details" },
  { id: "done", label: "done" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/** Where you are in checkout. Small, but it answers "how much longer?" */
export default function CheckoutSteps({ current }: { current: StepId }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="checkout-steps" aria-label="Checkout progress">
      {STEPS.map((step, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
        return (
          <li key={step.id} className="checkout-steps__step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span className="checkout-steps__dot" aria-hidden="true">
              {state === "done" ? <IconCheck /> : i + 1}
            </span>
            <span className="checkout-steps__label">
              {step.label}
              {state === "done" && <span className="visually-hidden"> (completed)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
