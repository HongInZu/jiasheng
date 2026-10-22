import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins:[vue()], server:{hmr:false}, build:{outDir:'dist'}, worker:{format:'es'}, optimizeDeps:{exclude:['@huggingface/transformers']} });
