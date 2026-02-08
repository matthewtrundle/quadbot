import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { getDb } from './db';
import * as schema from '@quadbot/db';

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  user: {
    additionalFields: {
      brandId: {
        type: 'string',
        required: false,
        input: false,
        fieldName: 'brandId',
      },
      role: {
        type: 'string',
        required: false,
        defaultValue: 'user',
        input: false,
        fieldName: 'role',
      },
    },
  },
  plugins: [nextCookies()],
});
