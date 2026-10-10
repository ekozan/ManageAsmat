import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relative : le site peut être servi depuis n'importe quel sous-dossier (ex. GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [react()],
});
