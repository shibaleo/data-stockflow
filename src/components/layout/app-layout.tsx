"use client";

import { useState, useEffect } from "react";
import { Menu } from "lucide-react";
import { SITE_NAME } from "@/lib/site";
import { Sidebar, SidebarNav } from "./sidebar";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import { UserMenu } from "./user-menu";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-dvh flex flex-col md:h-dvh md:flex-row md:overflow-hidden">
      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex md:hidden h-14 shrink-0 items-center border-b border-sidebar-border bg-sidebar px-3 gap-3">
        {mounted ? (
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button className="flex size-8 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
                <Menu className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent>
              <div className="flex h-14 items-center border-b border-sidebar-border px-3">
                <span className="text-lg font-semibold text-primary">
                  {SITE_NAME}
                </span>
              </div>
              <SidebarNav onNavigate={() => setSheetOpen(false)} />
            </SheetContent>
          </Sheet>
        ) : (
          <button className="flex size-8 items-center justify-center rounded-md text-sidebar-foreground/70">
            <Menu className="size-5" />
          </button>
        )}
        <span className="text-lg font-semibold truncate text-primary">
          {SITE_NAME}
        </span>
        <div className="ml-auto">
          <UserMenu collapsed />
        </div>
      </header>

      {/* Desktop sidebar */}
      <Sidebar />

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
