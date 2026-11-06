# ELVORAQ AI

Site oficial: https://elvoraq-ai.vercel.app/

Asistent AI în limba română pentru conversații, programare, analiză de documente, traduceri și idei.

## Tehnologii
- Vercel pentru găzduire și funcții serverless
- Supabase pentru autentificare și conversații
- OpenAI API pentru funcțiile AI

## Configurare
Variabilele se configurează în Vercel, nu în codul public:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `ELVORAQ_GUEST_SECRET` — secret aleator de minimum 32 de caractere, folosit pentru protejarea limitei Guest. Generează-l local cu `openssl rand -hex 32` și adaugă-l doar în Vercel.

### Activarea modului Guest
1. Execută integral `supabase/guest_rate_limits.sql` în Supabase → SQL Editor.
2. Adaugă `ELVORAQ_GUEST_SECRET` în Vercel → Project → Settings → Environment Variables (Production și Preview).
3. Redeployează proiectul Vercel după adăugarea variabilei.

Vizitatorii pot trimite maximum 10 mesaje text pe zi. Fișierele, generarea imaginilor, vocea și modelele avansate cer autentificare. Quota este verificată server-side prin Supabase; dacă migrarea sau secretul lipsesc, cererile Guest sunt refuzate în siguranță.

Nu publica niciodată cheile secrete în frontend sau în repository.
