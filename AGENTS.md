# Coastal Quest

- Render serves the Vite React static build. Supabase Edge Function `coastal-classroom` owns every classroom write and validates teacher JWTs/player tokens.
- Database objects start with `cq_`. Never modify existing Frostbound objects or global Auth settings without considering the existing app.
- Preserve `public/game` Unity binaries unchanged. Only same-origin iframe messages from that frame are accepted.
- Never commit secret/service-role keys. The frontend uses a publishable key only.
- Keep answer keys off student payloads until after their answer is committed. Answer submission and room controls must lock the room row in PostgreSQL.
- `npm run build` validates frontend TypeScript and builds the static site. `npm test` validates CSV/QR/binary integrity. `tests/hosted.mjs` checks the deployed classroom API; it does not prove a 60-person load or teacher email delivery.
