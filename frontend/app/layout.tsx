import type { Metadata } from "next";
import "@/styles/globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "PQR Analytics Dashboard",
  description:
    "Executive dashboard for PQR (Peticiones, Quejas y Reclamos) analytics and operational insights",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar navigation — server-rendered structure, client-interactivity */}
          <Sidebar activePath="/" />

          {/* Main content area */}
          <main className="flex-1 overflow-y-auto bg-gray-50">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
