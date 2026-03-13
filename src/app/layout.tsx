import type { Metadata } from "next";
import {
  ClerkProvider,
  SignInButton,
  Show,
} from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Toaster } from "sonner";
import { AppLayout } from "@/components/layout/app-layout";
import "./globals.css";

export const metadata: Metadata = {
  title: "data-stockflow",
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
          <Show when="signed-out">
            <div className="flex h-dvh items-center justify-center">
              <div className="text-center space-y-4">
                <h1 className="text-2xl font-semibold text-primary">
                  data-stockflow
                </h1>
                <p className="text-muted-foreground">ログインしてください</p>
                <SignInButton mode="modal">
                  <button className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                    ログイン
                  </button>
                </SignInButton>
              </div>
            </div>
          </Show>
          <Show when="signed-in">
            <AppLayout>{children}</AppLayout>
          </Show>
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
