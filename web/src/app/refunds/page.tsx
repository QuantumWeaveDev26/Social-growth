import { LegalPage } from "@/components/LegalPage";
export const metadata = { title: "Cancellation and refunds" };
export default function Refunds() {
  return (
    <LegalPage title="Cancellation and refunds" updated="31 October 2026">
      <h2>Cancelling</h2>
      <p>Plans run month to month with no automatic debit. To cancel, simply don’t pay the next month’s payment link, or write to support@brandmintai.io. Your scheduled posts for the paid month continue to go out unless you ask us to stop them.</p>
      <h2>Refunds</h2>
      <ul>
        <li><span className="font-semibold text-ink">Before work starts:</span> if you cancel within 48 hours of paying and before your month plan has been made, we refund the full amount.</li>
        <li><span className="font-semibold text-ink">After work starts:</span> once your month’s content is being made, that month’s fee is not refundable, because the AI and design costs have already been spent.</li>
        <li><span className="font-semibold text-ink">If we fail to deliver:</span> if we cannot make or publish the content in your plan because of a fault on our side, we refund the undelivered part of the month.</li>
      </ul>
      <h2>How refunds are paid</h2>
      <p>Approved refunds go back to the original payment method through Razorpay, usually within 5–7 working days.</p>
      <h2>Contact</h2>
      <p>support@brandmintai.io</p>
    </LegalPage>
  );
}
