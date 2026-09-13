/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  images: {
    // Mitigate AVIF/image-optimizer RCE class issues until sharp upstream is safe.
    formats: ["image/webp"],
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https://*.mapbox.com https://*.supabase.co https://www.overdriveradar.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com",
      "font-src 'self' data: https://api.mapbox.com https://*.mapbox.com",
      "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://www.googletagmanager.com https://www.google-analytics.com",
      "connect-src 'self' https://*.supabase.co https://*.mapbox.com https://api.mapbox.com https://events.mapbox.com https://va.vercel-scripts.com https://vitals.vercel-insights.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com",
      "worker-src 'self' blob:",
      "child-src blob:",
      "manifest-src 'self'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
