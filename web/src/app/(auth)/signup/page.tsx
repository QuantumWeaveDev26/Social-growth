import { SignUpForm } from "../AuthForms";
export const metadata = { title: "Start your month" };
export default async function Page({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return <SignUpForm plan={plan} />;
}
