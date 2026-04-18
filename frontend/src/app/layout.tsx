import './globals.css';
import { ReactNode } from 'react';
import Providers from '@/components/Providers';
import Navbar from '@/components/Navbar';

export const metadata = {
  title: 'WatchParty Starter',
  description: 'Simple watch party starter'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Navbar />
          <main className="container">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
