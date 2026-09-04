import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM binary; unpdf/mammoth pull in pdf.js + jszip — keep all of
  // them out of the bundler so they load at runtime in the Node route handler.
  serverExternalPackages: ["@electric-sql/pglite", "unpdf", "mammoth"],

  // NOTE: do not add a `/api/:path*` rewrite to the Python backend here.
  // `beforeFiles` rewrites run ahead of filesystem routes, so such a rule
  // hijacks every Next API route (auth, courses, generate, chat) and forwards
  // it to FastAPI, which serves none of them — the whole app 500s.
  // The backend is called directly from server code via PYTHON_BACKEND_URL
  // (see src/lib/generate-course.ts and src/lib/vector-store.ts), and its real
  // routes are /generate-course, /index-course, /search and /health.
};

export default nextConfig;
