import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      complexity: ['error', 10],
    },
  },
  {
    files: ['src/server/pricing/**/*.ts'],
    rules: {
      complexity: ['warn', 15],
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'src/server/db/schema.ts', 'next-env.d.ts'],
  },
];

export default config;
