import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SchemeSathi — Official Welfare Schemes Assistant',
  description: 'Multilingual (Hindi + English) RAG assistant for Indian government welfare schemes with grounded citations',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased min-h-screen flex flex-col">
        {children}
      </body>
    </html>
  );
}
