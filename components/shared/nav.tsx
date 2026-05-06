import Link from "next/link";

export function TopNav({
  active,
  showAdmin = false,
}: {
  active: "board" | "admin" | "meetings";
  showAdmin?: boolean;
}) {
  const items: { id: "board" | "admin" | "meetings"; label: string; href: string }[] = [
    { id: "board", label: "Board", href: "/board" },
  ];
  if (showAdmin) {
    items.push({ id: "admin", label: "Admin", href: "/admin" });
    items.push({ id: "meetings", label: "Meetings", href: "/meetings" });
  }
  return (
    <header className="border-b">
      <div className="mx-auto max-w-6xl px-6 h-12 flex items-center justify-between">
        <Link href="/board" className="text-sm font-semibold tracking-tight">
          overengineering
        </Link>
        <nav className="flex items-center gap-1">
          {items.map((it) => (
            <Link
              key={it.id}
              href={it.href}
              className={
                "px-2.5 h-7 inline-flex items-center rounded text-xs " +
                (active === it.id
                  ? "bg-ink-100 text-ink-950"
                  : "text-ink-600 hover:bg-ink-50")
              }
            >
              {it.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
