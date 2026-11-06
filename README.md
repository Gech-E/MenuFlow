# MenuFlow
Mobile-first digital restaurant menu and ordering MVP built with Next.js, React, TypeScript and Tailwind CSS.

## Run locally
```bash
npm install
npm run dev
```
Visit http://localhost:3000.

## MVP demo
- Customer menu: `/` or `/?table=3`
- Choose categories, add items, review cart and optionally tip a server.
- Submit an order, then open **Dashboard** to update its status.
- Dashboard can add items and toggle menu availability.
- All prices are in ETB.

## Important limitations
This initial runnable MVP is a **single-browser prototype** using localStorage, not a live multi-device restaurant system. Orders placed on different phones will **not** appear in the dashboard. Dashboard is not authenticated. Do not use it for real customer orders until server persistence, access controls and multi-tenant authorization are implemented.

## Production next steps
1. Add Supabase Postgres schema for restaurants, tables, menu items, orders and order lines with strict RLS.
2. Implement authenticated restaurant staff and server-side order submission.
3. Add live order subscriptions/polling and QR generation for each table.
4. Add server-validated pricing, inventory and optional tips.
5. Add integration tests, audit logs, rate limits, deployment and monitoring.

## Stack
Next.js App Router, React 19, Tailwind CSS 4, TypeScript, Lucide icons.
