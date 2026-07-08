const isDevelopment = process.env.NODE_ENV === "development";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
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
            destination: "http://localhost:3000/api/:path*"
          },
          {
            source: "/uploads/:path*",
            destination: "http://localhost:3000/uploads/:path*"
          }
        ];
      }
    }
    : {})
};

export default nextConfig;
