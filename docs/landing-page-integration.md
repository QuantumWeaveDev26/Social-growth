# Prompt: connect the brandmintai.io landing page to the BrandMint AI app

> Status: ON HOLD (4 Nov 2026). The owner decided to keep the main website separate for now. Use this later when connecting brandmintai.io/meta-growth to the app.

Paste everything below into the AI assistant (Claude, Codex, etc.) working in the project for
https://brandmintai.io/meta-growth/ (hosted on Hostinger).

---

## Context

This project is the marketing landing page at `https://brandmintai.io/meta-growth/`.

**Current flow (to be replaced):**
1. The visitor clicks "Choose Stay Active" or "Choose Reach More Customers".
2. They pay a one-time amount through Razorpay on this page.
3. They're redirected to WhatsApp (`https://wa.me/919972965677`) with a pre-filled message.

**New flow:** we now have a full web app at `https://app.brandmintai.io` that handles the whole customer journey:
- Sign-up.
- **Monthly auto-pay** through Razorpay Subscriptions (UPI Autopay or card).
- Business details, brand kit, and connecting Facebook + Instagram.
- AI-made posts and reels each month that the client approves, then automatic publishing.

The landing page should stop taking payments itself and send people to the app instead. The app already
pre-selects the plan from the link and takes the payment there.

Plan IDs in the app:
- `starter` = **Stay Active**, ₹3,999/month incl. 18% GST
- `growth` = **Reach More Customers**, ₹6,999/month incl. 18% GST

## Tasks

### 1. Point the plan buttons at the app (remove the one-time payment)

| Button | New link |
| --- | --- |
| "Choose Stay Active" | `https://app.brandmintai.io/signup?plan=starter` |
| "Choose Reach More Customers" | `https://app.brandmintai.io/signup?plan=growth` |

- Use plain `<a href>` links (opening in the same tab is fine). Don't add any JavaScript payment handler.
- **Remove the landing page's own Razorpay checkout** for these two plans: the checkout script, the order creation and the payment success handler. Also remove the redirect to WhatsApp after payment.
  - Keep the code in git history; just remove it from the live page.
  - If the payment code lives server-side (a PHP/Node endpoint, a Razorpay webhook), disable those routes too, so nobody can pay a one-time amount that never creates an app account.
- Check that no other element on the page still opens Razorpay. Search the code for `razorpay` and `checkout.js`.

### 2. Add a login link
- In the header nav, add **"Log in"** → `https://app.brandmintai.io/login`.
- Put it after "FAQ", styled as a text link, and also show it in the mobile menu.

### 3. Free trial: keep it on WhatsApp for now
- Leave every **"Start My Free Trial"** button pointing to `https://wa.me/919972965677`, with a pre-filled message, for example:
  `https://wa.me/919972965677?text=Hi%2C%20I%27d%20like%20to%20start%20the%20free%207-day%20trial%20for%20my%20business.`
- Keep the trial card as it is (₹0, 7 days, 2 posts + 1 reel, no card needed).
- Keep "Questions? Ask on WhatsApp" and the footer WhatsApp link as they are.

### 4. Update the text that no longer matches
- **Payment line.** Find the line saying the first month is paid through Razorpay and later months use a payment link, with no auto-debit. Replace it with:
  > Billed monthly by auto-pay (UPI Autopay or card) through Razorpay. Cancel anytime from your dashboard. No long-term contract. Ad spend is paid separately to Meta.
- **Remakes.** In both paid plan cards, and in the FAQ if there's a question about changes or revisions, add:
  > 3 free remakes every month. Extra remakes: ₹199 per post, ₹399 per reel.
- **"How it works" section, if there is one.** Make it describe this order:
  1. choose a plan and set up auto-pay
  2. tell us about your business
  3. connect Facebook & Instagram
  4. approve your posts
  5. we publish them on schedule
- **Brand name.**
  - The header logo text says **"Quantum Weave AI"**, but the app, the Meta app, emails and the Razorpay checkout all say **"BrandMint AI"**.
  - Change the visible brand name on this page to **BrandMint AI**: the header, the `<title>`, `og:site_name` and the footer.
  - Keep "by Quantum Weave AI" in the footer only if the owner wants it.
  - Ask the owner before changing the logo image.
- **Footer.** Add links to:
  - `https://app.brandmintai.io/terms`
  - `https://app.brandmintai.io/privacy`
  - `https://app.brandmintai.io/refunds`

  Also add the company name **Brandmint AI Private Limited** and the support email **support@brandmintai.io**. Use the registered address if the owner provides it.

### 5. Optional: tracking
- If the page has analytics (GA4, Meta Pixel), fire a `begin_checkout` / `InitiateCheckout` event with `plan` = `starter` or `growth` when a plan button is clicked, before the browser follows the link.

## Don't change
- Prices, plan contents or the design, except the text above.
- The domain or the DNS records. `app.brandmintai.io` already points to a separate server; don't touch the `app` A record.

## Test before deploying
1. Click each plan button. It should open `app.brandmintai.io/signup` with the right `?plan=`. Sign up with a test email, and the plan step should show that plan already selected.
2. Search the built site for `razorpay`. Nothing should remain, except text in the payment line.
3. The free-trial and WhatsApp buttons still open WhatsApp with the message.
4. Check on mobile: the header shows "Log in", and the plan buttons can be tapped.
5. Deploy to Hostinger the same way this site is normally deployed, then hard-refresh the live page and repeat checks 1–3.

## Report back
- The list of files changed.
- What was removed from the old Razorpay flow: client-side and server-side, and any webhook URL that should now be deleted in the Razorpay Dashboard.
- Whether there is a server-side payment endpoint or webhook that the owner needs to switch off in Razorpay.
