# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Cosmetics inventory management dashboard.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Excel export**: xlsx (SheetJS)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Features

- **Products** — full CRUD with low stock highlighting (< threshold = orange, 0 = red)
- **Inline stock editing** — +/- buttons or click to type
- **Inventory logs** — every stock change recorded with opening balance, change amount, closing balance, timestamp
- **Excel exports**:
  - "Raw Log" — all inventory movement entries in chronological order
  - "Inventory Report" — per-product breakdown with opening, in, out, ending balance per movement

## Database Schema

- `products` — product catalog (id, name, sku, category, description, price, stock, low_stock_threshold)
- `inventory_logs` — movement log (id, product_id, type, quantity_change, opening_balance, closing_balance, notes, created_at)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
