"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/dash/icons";

const OPERACAO: { href: string; label: string; icon: IconName; badge?: string }[] = [
  { href: "/", label: "Visão Geral", icon: "zap" },
  { href: "/posts", label: "Posts", icon: "file" },
  { href: "/execucoes", label: "Execuções", icon: "activity" },
  { href: "/logs", label: "Logs ao vivo", icon: "terminal" },
];
const MANUAL: { href: string; label: string; icon: IconName; badge?: string }[] = [
  { href: "/temas", label: "Temas", icon: "edit", badge: "novo" },
];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const item = (it: { href: string; label: string; icon: IconName; badge?: string }) => {
    const I = Icon[it.icon];
    return (
      <Link key={it.href} href={it.href} className={"nav-item" + (isActive(it.href) ? " active" : "")}>
        <I />
        <span>{it.label}</span>
        {it.badge ? <span className="nav-badge">{it.badge}</span> : null}
      </Link>
    );
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Icon.spark style={{ width: 20, height: 20, color: "var(--magenta)" }} />
        </div>
        <div>
          <div className="brand-name">Radiata</div>
          <div className="brand-sub">radiata.pro</div>
        </div>
      </div>

      <nav className="nav">
        <div className="nav-label">Operação</div>
        {OPERACAO.map(item)}
        <div className="nav-label">Conteúdo manual</div>
        {MANUAL.map(item)}
      </nav>

      <div className="sidebar-foot">
        <div className="l1">
          <span className="sys-dot" />
          Sistema 1 ativo
        </div>
        <div className="l2">piloto automático · 1x/dia · ~07h</div>
      </div>
    </aside>
  );
}
