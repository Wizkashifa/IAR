/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@google-cloud/firestore"],
  // Receipts and invoices are posted through server actions: up to 10 files of 10 MB.
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
};
export default nextConfig;
