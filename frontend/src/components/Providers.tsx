'use client';

import { ReactNode } from 'react';
import { GuestProvider } from './GuestProvider';

export default function Providers({ children }: { children: ReactNode }) {
  return <GuestProvider>{children}</GuestProvider>;
}
