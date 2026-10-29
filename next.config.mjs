/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // the API routes read the sample CSV, the recorded run and the rule-watch snapshot from ./data at runtime
  outputFileTracingIncludes: { "/api/*": ["./data/**/*"] },
};
export default nextConfig;
