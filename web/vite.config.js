import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

const useHttps = process.env.NO_SSL !== '1';

export default defineConfig({
  // basicSsl serves HTTPS with a self-signed cert so the microphone (Web Speech
  // API) works when accessing from a phone on the local network.
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  server: {
    port: 5173,
    host: true, // expõe na rede local (0.0.0.0) para acesso pelo celular
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
});
