import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // /budget is the self-contained budget sandbox (public/budget.html). Both paths are
  // gated by the admin cookie in middleware.ts — it carries named salaries.
  async rewrites() {
    return [{ source: "/budget", destination: "/budget.html" }];
  },
};

export default config;
