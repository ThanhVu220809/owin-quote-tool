# OWIN Quote Tool — Dev

Portfolio overview (không lộ kiến trúc source): **[README monorepo](../README.md)** · live: [saigonfox.online](https://saigonfox.online)

## Local

```bash
cp .env.example .env
npm ci
npm run dev
```

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

```bash
npm run lint && npm test && npm run build
```

Supabase schema / secrets Pages: `supabase/SETUP.md`.  
Chỉ `anon` key trên frontend — không `service_role`.
