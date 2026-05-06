import { listInvestors, listIntros } from "@/lib/sheets";
import { TopNav } from "@/components/shared/nav";
import { AdminClient } from "./admin-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  const [investors, intros] = await Promise.all([listInvestors(), listIntros()]);
  return (
    <>
      <TopNav active="admin" showAdmin />
      <AdminClient initialInvestors={investors} initialIntros={intros} />
    </>
  );
}
