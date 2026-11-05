import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { ConnectionProvider } from "@/components/connection-provider";
import { DeviceProvider } from "@/components/devices/device-provider";
import { AppShell } from "@/components/layout/app-shell";
import { NavigationMemoryProvider } from "@/components/layout/navigation-memory";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { ProjectsProvider } from "@/components/projects/projects-provider";
import { ProvidersProvider } from "@/components/providers/providers-provider";
import { ConversationPreferences } from "@/components/sessions/conversation-preferences";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter-sans" });

export const metadata: Metadata = {
  title: "Console",
  description: "Your devices. Your work.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
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
                <ProjectsProvider>
                  <ConversationPreferences>
                    <TooltipProvider>
                      <NavigationMemoryProvider>
                        <AppShell>{children}</AppShell>
                      </NavigationMemoryProvider>
                    </TooltipProvider>
                  </ConversationPreferences>
                </ProjectsProvider>
              </ProvidersProvider>
            </DeviceProvider>
          </ConnectionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
