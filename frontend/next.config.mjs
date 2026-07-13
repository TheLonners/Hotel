const isDevelopment = process.env.NODE_ENV === "development";

/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  ...(isDevelopment
    ? {
      async rewrites() {
        return [
          {
            source: "/api/:path*",
            destination: "http://localhost:3001/api/:path*"
          },
          {
            source: "/uploads/:path*",
            destination: "http://localhost:3001/uploads/:path*"
          }
        ];
      }
    }
    : { output: "export" })
};

export default nextConfig;
