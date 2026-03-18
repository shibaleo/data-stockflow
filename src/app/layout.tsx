import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Toaster } from "sonner";
import { AuthGate } from "@/components/auth/auth-gate";
import { AppLayout } from "@/components/layout/app-layout";
import { SITE_NAME } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: SITE_NAME,
  description: "会計データベース",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider appearance={{ baseTheme: dark }}>
      <html lang="ja" className="dark">
        <body className="font-sans antialiased">
          <AuthGate>
            <AppLayout>{children}</AppLayout>
          </AuthGate>
          <Toaster
            theme="dark"
            toastOptions={{
              style: {
                background: "var(--card)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
              },
            }}
          />
        </body>
      </html>
    </ClerkProvider>
  );
}
