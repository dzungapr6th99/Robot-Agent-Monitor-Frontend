import type { Metadata } from "next";
import { MonitorProvider } from "../components/monitor-provider";
import { AppShell } from "../components/app-shell";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "Robot Agent Monitor",
  description: "Local robot configuration and ROS 2 monitoring",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <MonitorProvider>
          <AppShell>{children}</AppShell>
        </MonitorProvider>
      </body>
    </html>
  );
}
