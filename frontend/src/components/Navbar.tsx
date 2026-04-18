'use client';

import Link from 'next/link';
import { signIn, signOut, useSession } from 'next-auth/react';

export default function Navbar() {
  const { data: session } = useSession();

  return (
    <nav className="nav">
      <div className="nav-brand">
        <Link href="/">WatchParty</Link>
      </div>
      
      <div className="nav-links">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/create-room">Create Room</Link>
        
        {session?.user ? (
          <button className="button button-secondary" onClick={() => signOut()}>
            Logout
          </button>
        ) : (
          <button className="button" onClick={() => signIn('google')}>
            Login with Google
          </button>
        )}
      </div>
    </nav>
  );
}
