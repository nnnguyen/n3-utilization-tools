# N3 Connect — backend

NestJS API of N3 Connect, served under `/api`. Setup, environment variables, conventions and deployment are documented in the [root README](../README.md).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run start:dev` | Start in watch mode (http://localhost:3001/api with `PORT=3001`) |
| `npm run build` | Generate the Prisma client and compile to `dist/` |
| `npm run start:prod` | Apply migrations (`prisma migrate deploy`) and start `dist/` — used on Railway |
| `npm test` | Unit tests (Jest) |
| `npm run test:e2e` | End-to-end tests |
| `npm run lint` | ESLint (with `--fix`) |
| `npm run format` | Prettier |
| `npm run load-test:join` | Load test of the Word Cloud join flow (`LOAD_TEST_*` variables, see `scripts/load-test-join.mjs`) |

Schema changes: edit `prisma/schema.prisma`, then `npx prisma migrate dev --name <snake_case>` and commit the migration.
