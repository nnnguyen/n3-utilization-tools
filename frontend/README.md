# N3 Connect — frontend

Next.js (App Router) app of N3 Connect. Setup, environment variables, conventions and deployment are documented in the [root README](../README.md).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server on http://localhost:3000 (needs `NEXT_PUBLIC_API_URL` in `.env.local`) |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Unit tests (`node --test`, files `*.test.ts` under `app/` and `lib/`) |
| `npm run lint` | ESLint |

Type-check with `npx tsc --noEmit -p .`.
