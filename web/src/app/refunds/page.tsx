import { LegalPage } from "@/components/LegalPage";
export const metadata = { title: "Cancellation and refunds" };
export default function Refunds() {
  return (
    <LegalPage title="Cancellation and refunds" updated="31 October 2026">
      <h2>Cancelling</h2>
      <p>Plans run month to month on auto-pay. To cancel, turn off auto-pay on the Billing page (or cancel the mandate in your UPI app), or write to support@brandmintai.io. No further charges are taken; your plan stays active until the end of the month already paid. Your scheduled posts for the paid month continue to go out unless you ask us to stop them.</p>
      <h2>Refunds</h2>
      <ul>
        <li><span className="font-semibold text-ink">Before work starts:</span> if you cancel within 48 hours of paying and before your month plan has been made, we refund the full amount.</li>
        <li><span className="font-semibold text-ink">After work starts:</span> once your month’s content is being made, that month’s fee is not refundable, because the AI and design costs have already been spent.</li>
        <li><span className="font-semibold text-ink">Extra remakes:</span> a paid remake (₹199 post, ₹399 reel) is not refundable once it has been made. If it fails to generate, you can retry it free.</li>
        <li><span className="font-semibold text-ink">If we fail to deliver:</span> if we cannot make or publish the content in your plan because of a fault on our side, we refund the undelivered part of the month.</li>
      </ul>
      <h2>How refunds are paid</h2>
      <p>Approved refunds go back to the original payment method through Razorpay, usually within 5–7 working days.</p>
      <h2>Contact</h2>
      <p>support@brandmintai.io</p>
    </LegalPage>
  );
}
