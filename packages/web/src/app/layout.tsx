import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import { ConnectionProvider } from "@/components/connection-provider";
import { DeviceProvider } from "@/components/devices/device-provider";
import { AppShell } from "@/components/layout/app-shell";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { ProvidersProvider } from "@/components/providers/providers-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "Console",
  description: "Your devices. Your work.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ConnectionProvider>
            <DeviceProvider>
              <ProvidersProvider>
                <TooltipProvider>
                  <AppShell>{children}</AppShell>
                </TooltipProvider>
              </ProvidersProvider>
            </DeviceProvider>
          </ConnectionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
