import { MenuAdmin } from "@/components/admin/MenuAdmin";
import { exigirAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await exigirAdmin();
  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <MenuAdmin />
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}
