import './globals.css';
import { ReactNode } from 'react';
import Providers from '@/components/Providers';
import Navbar from '@/components/Navbar';

export const metadata = {
  title: 'WatchParty — Watch together',
  description: 'Create a room, invite your people, and enjoy synchronized video, chat, and calls.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <Providers>
          <Navbar />
          <main id="main-content" className="container" tabIndex={-1}>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
