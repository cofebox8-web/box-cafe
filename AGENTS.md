# Project guidance

- This is a build-free static web project. Do not add Node.js, npm, a bundler, or a server runtime.
- Vercel serves static files. Supabase is accessed from browser JavaScript through its official JS client CDN.
- Never put a Supabase service-role/secret key in browser files. The publishable key is safe only alongside correct database RLS policies.
- Keep Arabic as the primary language, use RTL layout, and design every customer and staff screen for phone, tablet, and desktop.
- Keep database changes in ordered SQL migrations under `supabase/migrations/`.
- Do not implement product workflows until they are documented and agreed in `docs/architecture.md`.
