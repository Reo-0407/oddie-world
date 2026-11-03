import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/oddie-world/',
  plugins: [react()],
  test: { environment: 'node' },
});
