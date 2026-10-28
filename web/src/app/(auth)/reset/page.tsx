import { ResetForm } from "../ResetForms";
export const metadata = { title: "Choose a new password" };
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <ResetForm token={token ?? ""} />;
}
