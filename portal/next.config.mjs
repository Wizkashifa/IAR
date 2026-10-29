/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@google-cloud/firestore"],
  // Receipts and invoices are posted through server actions: up to 10 files of 10 MB.
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
  // Portal measures moved out from under Portal Settings, so executives can open it; old links still work.
  async redirects() {
    return [{ source: "/admin/measures", destination: "/measures", permanent: false }];
  },
};
export default nextConfig;
