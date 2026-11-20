import { QueryProvider } from '@/components/query-provider';
import { APP_TITLE, LOGO_SRC } from '@/lib/constants';
import type { Metadata } from 'next';
import type React from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: APP_TITLE,
  description: 'Centro de mando comercial de Abarrotera del Centro sobre Snowflake',
  icons: { icon: LOGO_SRC },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
