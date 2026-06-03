import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { features, optionalEnv } from "@/lib/env";

/**
 * Auth.js (NextAuth v5): Google OAuth in production. When Google isn't
 * configured (local dev), a guarded "dev login" lets you sign in as a demo
 * user so the full app is usable without OAuth setup. Both paths store the
 * user in our Postgres so foreign keys to projects/songs resolve.
 */
const hasGoogle = !!(optionalEnv("AUTH_GOOGLE_ID") && optionalEnv("AUTH_GOOGLE_SECRET"));
const devLogin =
  optionalEnv("DEV_LOGIN") === "1" || (!hasGoogle && process.env.NODE_ENV !== "production");

async function ensureDemoUser(): Promise<string> {
  const database = getDb();
  const email = "dev@mnemosong.local";
  const [existing] = await database.select().from(users).where(eq(users.email, email));
  if (existing) return existing.id;
  const [created] = await database
    .insert(users)
    .values({ email, name: "Dev User" })
    .returning({ id: users.id });
  return created.id;
}

function buildConfig() {
  const providers: any[] = [];
  if (hasGoogle) {
    providers.push(
      Google({
        clientId: optionalEnv("AUTH_GOOGLE_ID")!,
        clientSecret: optionalEnv("AUTH_GOOGLE_SECRET")!,
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }
  if (devLogin && features.hasDb()) {
    providers.push(
      Credentials({
        id: "dev",
        name: "Dev login",
        credentials: {},
        authorize: async () => {
          const id = await ensureDemoUser();
          return { id, email: "dev@mnemosong.local", name: "Dev User" };
        },
      }),
    );
  }

  // Credentials requires JWT sessions; OAuth-only uses database sessions.
  const strategy: "jwt" | "database" = hasGoogle && !devLogin ? "database" : "jwt";

  return {
    adapter: features.hasDb()
      ? DrizzleAdapter(getDb(), {
          usersTable: users,
          accountsTable: accounts,
          sessionsTable: sessions,
          verificationTokensTable: verificationTokens,
        })
      : undefined,
    session: { strategy },
    trustHost: true,
    providers,
    pages: { signIn: "/signin" },
    callbacks: {
      jwt({ token, user }: any) {
        if (user) token.sub = user.id;
        return token;
      },
      session({ session, user, token }: any) {
        const id = user?.id ?? token?.sub;
        if (session.user && id) session.user.id = id;
        return session;
      },
    },
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth(buildConfig());

export const authInfo = { hasGoogle, devLogin };

/** Returns the signed-in user's id, or null. */
export async function currentUserId(): Promise<string | null> {
  try {
    const session = await auth();
    return (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    return null;
  }
}
