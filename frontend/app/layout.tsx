import type { Metadata } from "next";
import "@/styles/globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "VantiOps 360",
  description: "Control Tower de Operaciones, Datos y Aliados Estratégicos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1 text-center text-xs text-amber-800">
          Prototipo conceptual para validación de experiencia y arquitectura. No conectado con sistemas productivos de Vanti.
        </div>
        <div className="flex h-[calc(100vh-28px)] overflow-hidden">
          {/* Sidebar navigation */}
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
