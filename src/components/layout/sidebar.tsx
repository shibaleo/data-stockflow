"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Building2,
  Calendar,
  FileCode2,
  FolderKanban,
  ScrollText,
  List,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Shield,
  Tag,
  Users,
} from "lucide-react";
import { UserButton, useUser } from "@clerk/nextjs";
import { cn } from "@/lib/utils";

const EXPANDED_WIDTH = 224;
const COLLAPSED_WIDTH = 56;

interface NavItem {
  href: string;
  label: string;
  icon: typeof PenLine;
  separator?: boolean;
}

const navItems: NavItem[] = [
  // 日常業務
  { href: "/vouchers", label: "取引", icon: PenLine },
  { href: "/aggregation", label: "集計", icon: BarChart3 },
  // マスタ管理
  { href: "/accounts", label: "科目", icon: List, separator: true },
  { href: "/departments", label: "部門", icon: Building2 },
  { href: "/counterparties", label: "取引先", icon: Users },
  { href: "/projects", label: "プロジェクト", icon: FolderKanban },
  { href: "/categories", label: "分類", icon: Tag },
  // 設定
  { href: "/periods", label: "期間", icon: Calendar, separator: true },
  { href: "/books", label: "帳簿", icon: BookOpen },
  { href: "/users", label: "ユーザー", icon: Shield },
  { href: "/audit-logs", label: "監査ログ", icon: ScrollText },
  { href: "/api-doc", label: "API", icon: FileCode2 },
];

export function SidebarNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      <nav className="flex-1 space-y-0.5 p-2 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <div key={item.href}>
              {item.separator && (
                <div className="my-2 border-t border-sidebar-border/50" />
              )}
              <Link
                href={item.href}
                title={item.label}
                onClick={onNavigate}
                className={cn(
                  "flex items-center rounded-md pl-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span
                  className={cn(
                    "whitespace-nowrap transition-opacity duration-200",
                    collapsed
                      ? "opacity-0 w-0 overflow-hidden"
                      : "opacity-100 ml-3"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </div>
          );
        })}
      </nav>

      <UserSection collapsed={collapsed} />
    </>
  );
}

function UserSection({ collapsed = false }: { collapsed?: boolean }) {
  const { user } = useUser();
  const name = user?.fullName ?? user?.firstName ?? null;

  return (
    <div className="border-t border-sidebar-border px-3 py-3">
      <div className="flex items-center gap-2">
        <UserButton />
        {name && (
          <span
            className={cn(
              "truncate text-sm text-sidebar-foreground whitespace-nowrap transition-opacity duration-200",
              collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
            )}
          >
            {name}
          </span>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  return (
    <aside
      className="hidden md:flex h-screen flex-col border-r border-sidebar-border bg-sidebar overflow-hidden transition-all duration-300"
      style={{ width: sidebarWidth }}
    >
      <div className="flex h-14 items-center border-b border-sidebar-border px-3 gap-2">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex shrink-0 size-8 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
        <span
          className={cn(
            "truncate text-lg font-semibold text-primary whitespace-nowrap transition-opacity duration-200",
            collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
          )}
        >
          data-stockflow
        </span>
      </div>

      <SidebarNav collapsed={collapsed} />
    </aside>
  );
}
