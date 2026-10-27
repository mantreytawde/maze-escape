import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// A headset loads the page over the local network, where WebXR only runs on HTTPS (`npm run dev:vr`).
export default defineConfig(({ mode }) => {
  const vr = mode === 'vr';
  return {
    plugins: vr ? [basicSsl()] : [],
    server: {
      host: vr,
      port: 2005,
      strictPort: true,
    },
    preview: {
      port: 2005,
      strictPort: true,
    },
  };
});
