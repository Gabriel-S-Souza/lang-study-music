import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Dev atrás de túnel (ngrok, localtunnel): o Next 15 bloqueia origens cruzadas para `/_next/*`
   * sem isso a página quebra ao abrir pelo URL HTTPS do túnel.
   */
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok-free.dev",
    "*.ngrok.io",
    "*.ngrok.app",
    "*.loca.lt",
  ],

  /**
   * Com a página em HTTPS (ex.: ngrok só na 3000), o browser não pode chamar `http://IP:8000`.
   * Sem `NEXT_PUBLIC_API_URL`, o cliente usa `/api/...` e isto repassa ao FastAPI local.
   * Em `next start`, defina `NEXT_PUBLIC_RELATIVE_API=1` no **build** para ativar o mesmo proxy.
   */
  async rewrites() {
    const backend = process.env.STUDY_API_PROXY_TARGET?.trim() || "http://127.0.0.1:8000";
    const enable =
      process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_RELATIVE_API === "1";
    if (!enable) {
      return [];
    }
    return [
      { source: "/api/videos/:path*", destination: `${backend}/api/videos/:path*` },
      { source: "/api/study/:path*", destination: `${backend}/api/study/:path*` },
    ];
  },
};

export default nextConfig;
