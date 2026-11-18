import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // el framework cambia poco: va aparte para que quede en caché aunque cambie el contenido
        manualChunks: (id) => (/node_modules[\/](react|react-dom|react-router|react-router-dom|scheduler)[\/]/.test(id) ? 'vendor' : undefined),
      },
    },
  },
})
