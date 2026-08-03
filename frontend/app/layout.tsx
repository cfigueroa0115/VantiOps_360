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
        <div className="flex h-[calc(100vh-52px)] overflow-hidden">
          {/* Sidebar navigation */}
          <Sidebar activePath="/" />

          {/* Main content area */}
          <main className="flex-1 flex flex-col overflow-hidden min-w-0">
            <div className="flex-1 overflow-y-auto bg-gray-50 pt-2 lg:pt-0">
              {children}
            </div>
            {/* Global authorship footer */}
            <footer className="border-t border-gray-200 bg-white px-4 py-2 text-center text-[11px] text-gray-500 shrink-0">
             Copyright © 2026 Carlos Alberto Figueroa Martínez
            </footer>
          </main>
        </div>
      </body>
    </html>
  );
}
