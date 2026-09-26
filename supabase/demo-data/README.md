# Supabase demo data import

These CSV files migrate the operational data from `lib/demo-data.ts`. `profiles.csv` maps the three demo employee IDs to the provided existing Supabase Auth users. The UUIDs, names, roles, airport, and timestamps are filled in. Import these rows only if those Auth users do not already have rows in `public.profiles`; never create Auth users solely to satisfy this CSV. For operational CSVs, replace `PEN12345`, `PEN23456`, and `PEN34567` with the corresponding `employee_id` values if the profile IDs differ. Keep each replacement consistent across all operational CSVs and the local demo data if you change the mappings. Any blank employee reference stays blank.

## Supabase steps

1. In Supabase Dashboard, open **SQL Editor**. Run `supabase/profiles.sql` if `public.profiles` has not been created yet. Existing profiles are not overwritten.
2. Run `supabase/schema.sql` in SQL Editor to create the five operational tables and read-only authenticated access policies.
3. In **Table Editor**, import `assets.csv` into `assets`.
4. Import `findings.csv` into `findings`, then `work_orders.csv` into `work_orders`, `evidence.csv` into `evidence`, and `issue_history.csv` into `issue_history`. Match CSV headers to the identically named table columns. Import in this order to satisfy foreign keys.
5. Review row counts (10 assets, 10 findings, 5 work orders, 5 evidence rows, 9 history rows) and confirm employee references resolve to existing profiles. Do not import `profiles.csv` until it is filled for real Auth users who do not yet have profile rows.

Evidence rows store metadata and paths only. Upload the actual files separately to the Supabase Storage bucket if those files become available.
