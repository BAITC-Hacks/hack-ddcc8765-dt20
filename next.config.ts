import type { NextConfig } from "next";
const appOrigin = process.env.APP_ORIGIN?.trim();
const config: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: appOrigin ? [new URL(appOrigin).hostname] : [],
};
export default config;
