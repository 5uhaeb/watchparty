import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';

const providers: NextAuthOptions['providers'] = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!
  })
];

if (process.env.NODE_ENV !== 'production') {
  providers.push(
    CredentialsProvider({
      id: 'test-login',
      name: 'Test Login',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (credentials?.password !== 'test-password' || !credentials.email) return null;

        return {
          id: credentials.email,
          email: credentials.email,
          name: credentials.email.split('@')[0],
        };
      }
    })
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user }) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/sync-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: user.name,
            email: user.email,
            image: user.image,
            provider: 'google'
          })
        });
      } catch (error) {
        console.error('Failed to sync user', error);
      }
      return true;
    }
  }
};
