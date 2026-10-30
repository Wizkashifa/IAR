/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@google-cloud/firestore"],
  // Receipts and invoices are posted through server actions: up to 10 files of 10 MB.
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
  // Portal measures moved out from under Portal Settings, so executives can open it; old links still work.
  async redirects() {
    return [
      { source: "/admin/measures", destination: "/measures", permanent: false },
      // Team Queues is retired: old Chat alerts for a team go straight to its page (app/queues/page.tsx handles the rest).
      { source: "/queues", has: [{ type: "query", key: "team", value: "marketing" }], destination: "/marketing?view=team", permanent: false },
      { source: "/queues", has: [{ type: "query", key: "team", value: "av" }], destination: "/it-maintenance?view=team", permanent: false },
      // The Finance desk folded into Payments: its lists are views there, and card statements moved up a level.
      { source: "/purchases/finance/statement", destination: "/purchases/statement", permanent: false },
      { source: "/purchases/finance", has: [{ type: "query", key: "tab", value: "books" }], destination: "/purchases?view=books", permanent: false },
      { source: "/purchases/finance", has: [{ type: "query", key: "tab", value: "returns" }], destination: "/purchases?view=returns", permanent: false },
      { source: "/purchases/finance", destination: "/purchases?view=payment", permanent: false },
    ];
  },
};
export default nextConfig;
