"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Visão Geral", icon: "⚡" },
  { href: "/posts", label: "Posts", icon: "📄" },
  { href: "/execucoes", label: "Execuções", icon: "🔄" },
  { href: "/logs", label: "Logs ao vivo", icon: "📡" },
  { href: "/temas", label: "Temas", icon: "✏️" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-sidebar flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🌸</span>
          <div>
            <p className="font-semibold text-sm leading-none">Radiata</p>
            <p className="text-xs text-muted-foreground mt-0.5">Blog Animes</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-2 space-y-0.5">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.soon ? "#" : item.href}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
              pathname === item.href
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60",
              item.soon && "opacity-40 cursor-not-allowed pointer-events-none"
            )}
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
            {item.soon && (
              <span className="ml-auto text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                em breve
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-border">
        <div className="text-xs text-muted-foreground">
          <p className="font-medium text-foreground/70">Sistema 1 ativo</p>
          <p>radiata.pro · WordPress</p>
        </div>
      </div>
    </aside>
  );
}
