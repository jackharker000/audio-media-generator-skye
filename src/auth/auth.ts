import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { FirestoreAdapter } from "@auth/firebase-adapter";
import { getDb } from "@/db";
import { DEFAULT_SITE_URL, features, optionalEnv } from "@/lib/env";

/**
 * Auth.js (NextAuth v5): Google OAuth in production, stored in Firestore via the
 * Firebase adapter. When Google isn't configured (local dev), a guarded "dev
 * login" signs you in as a demo user so the app is usable without OAuth setup.
 */
const hasGoogle = !!(optionalEnv("AUTH_GOOGLE_ID") && optionalEnv("AUTH_GOOGLE_SECRET"));
const devLogin =
  optionalEnv("DEV_LOGIN") === "1" || (!hasGoogle && process.env.NODE_ENV !== "production");

// Hard-code the production callback base so OAuth redirects use the stable
// domain instead of the per-deployment URL. Override with AUTH_URL if needed.
if (!process.env.AUTH_URL && process.env.NODE_ENV === "production") {
  process.env.AUTH_URL = DEFAULT_SITE_URL;
}

/** Find an existing user by email or create one — gives each email its own account. */
async function findOrCreateUser(email: string, name?: string): Promise<string> {
  const db = getDb();
  const snap = await db.collection("users").where("email", "==", email).limit(1).get();
  if (!snap.empty) return snap.docs[0].id;
  const ref = await db.collection("users").add({
    email,
    name: name || email.split("@")[0],
    emailVerified: null,
    image: null,
  });
  return ref.id;
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
        id: "credentials",
        name: "Email",
        credentials: {
          email: { label: "Email", type: "email" },
          name: { label: "Name", type: "text" },
        },
        authorize: async (creds) => {
          const email = String(creds?.email ?? "").trim().toLowerCase();
          if (!email || !email.includes("@")) return null;
          const name = creds?.name ? String(creds.name) : undefined;
          const id = await findOrCreateUser(email, name);
          return { id, email, name: name ?? email };
        },
      }),
    );
  }

  // Credentials requires JWT sessions; OAuth-only can use database sessions.
  const strategy: "jwt" | "database" = hasGoogle && !devLogin ? "database" : "jwt";

  return {
    adapter: features.hasDb() ? FirestoreAdapter(getDb()) : undefined,
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
