import { LegalPage } from "@/components/LegalPage";
export const metadata = { title: "Terms of service" };
export default function Terms() {
  return (
    <LegalPage title="Terms of service" updated="31 October 2026">
      <p>These terms cover your use of BrandMint AI, a service of BrandMint AI Private Limited (“we”, “us”). By creating an account you agree to them.</p>
      <h2>What we provide</h2>
      <p>For each monthly plan we write a brand profile, plan your month and make the number of image posts and short videos (reels) listed for that plan on our pricing page. Content is made with AI tools. You review every item, and we publish only what you approve to the Facebook Page and Instagram account you connect.</p>
      <h2>Your account</h2>
      <ul>
        <li>Keep your login details safe. You are responsible for activity on your account.</li>
        <li>The business details, logo and other material you give us must be yours or used with permission.</li>
        <li>You must have the right to manage the Facebook Page and Instagram account you connect.</li>
      </ul>
      <h2>Approvals and changes</h2>
      <p>Each item includes the number of change rounds shown for your plan. Approving an item means you are happy for it to be published as shown. You are responsible for checking facts, prices and offers in your content before you approve it.</p>
      <h2>Plans and payment</h2>
      <p>Plans are billed monthly in Indian rupees, including GST. Your first month is paid through Razorpay. After that we send a payment link each month; there is no automatic debit and no long-term contract. Advertising spend, where your plan includes ad setup, is paid by you directly to Meta.</p>
      <h2>What we do not promise</h2>
      <p>We do not guarantee followers, reach, leads or sales. Social platforms can change their rules or limit accounts at any time; we are not responsible for their decisions.</p>
      <h2>Acceptable use</h2>
      <p>You may not use BrandMint AI for content that is illegal, misleading, hateful, sexual, or that infringes anyone’s rights. We may decline to make or publish such content and may suspend accounts that break these terms.</p>
      <h2>Ownership</h2>
      <p>Once paid for, the posts and videos we make for you are yours to use. We may keep copies to run the service and will not show them publicly without your permission.</p>
      <h2>Ending the service</h2>
      <p>You can stop at the end of any paid month by not renewing. We may end the service with notice if these terms are broken. See our <a className="font-semibold text-mint-deep underline" href="/refunds">cancellation and refund policy</a>.</p>
      <h2>Liability</h2>
      <p>To the extent the law allows, our total liability for any claim is limited to the amount you paid us for the month in which the claim arose.</p>
      <h2>Law</h2>
      <p>These terms are governed by the laws of India. Courts in Bengaluru, Karnataka have jurisdiction.</p>
      <h2>Contact</h2>
      <p>support@brandmintai.io</p>
    </LegalPage>
  );
}
