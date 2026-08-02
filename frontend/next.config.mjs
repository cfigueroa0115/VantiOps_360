/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Rewrite API calls to the backend in production
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
