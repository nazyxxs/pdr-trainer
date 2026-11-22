import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' - щоб сайт працював і на GitHub Pages (у підпапці), і локально
export default defineConfig({
  plugins: [react()],
  base: './',
})
