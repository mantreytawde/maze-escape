import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// The headset loads the page over the local network, and WebXR only runs on HTTPS there.
export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
});
