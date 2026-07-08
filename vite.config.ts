import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mockApi } from './dev/mock-api';

export default defineConfig({
  plugins: [react(), mockApi()],
});
