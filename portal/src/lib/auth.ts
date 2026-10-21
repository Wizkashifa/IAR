import "server-only";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { mayUsePortal, ORG } from "./org";
import { lookupGroups } from "./groups";

const GROUP_REFRESH_MS = 15 * 60 * 1000;

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // Show only accounts on the organization's domain in Google's picker.
      authorization: { params: { hd: ORG.domain, prompt: "select_account" } },
    }),
  ],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    // The hd parameter is only a hint; enforce the domain here.
    async signIn({ profile }) {
      const p = profile as { email?: string; email_verified?: boolean; hd?: string } | undefined;
      const inDomain = Boolean(p?.email_verified && p.hd === ORG.domain && p.email?.toLowerCase().endsWith(`@${ORG.domain}`));
      if (!inDomain || !p?.email) return false;
      if (!process.env.PORTAL_ACCESS_GROUP) return true;
      try {
        return mayUsePortal(await lookupGroups(p.email)) || "/signin?error=NotInBeta";
      } catch (err) {
        console.error("group lookup failed at sign-in", err);
        return "/signin?error=NotInBeta";
      }
    },
    // Group membership is looked up at sign-in and refreshed every 15 minutes,
    // so removing someone from a group takes effect without a new login.
    async jwt({ token }) {
      const at = typeof token.groupsAt === "number" ? token.groupsAt : 0;
      if (token.email && Date.now() - at > GROUP_REFRESH_MS) {
        try {
          token.groups = await lookupGroups(token.email);
          token.groupsAt = Date.now();
        } catch (err) {
          console.error("group lookup failed", err);
          token.groups = token.groups ?? [];
        }
      }
      return token;
    },
    async session({ session, token }) {
      return { ...session, groups: Array.isArray(token.groups) ? (token.groups as string[]) : [] };
    },
  },
};
