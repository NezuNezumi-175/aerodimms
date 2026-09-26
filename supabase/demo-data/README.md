# Supabase demo data import

These CSV files migrate the operational data from `lib/demo-data.ts`. Profile rows are intentionally excluded. The `PEN12345`, `PEN23456`, and `PEN34567` values are mapping placeholders from the old local demo; replace each with the `employee_id` of the corresponding existing person in `public.profiles` before import. Keep the same replacement consistent across all CSVs. Never create or import demo profiles. Any blank employee ID stays blank.

## Supabase steps

1. In Supabase Dashboard, open **SQL Editor**. Run `supabase/profiles.sql` if `public.profiles` has not been created yet. Existing profiles are not overwritten.
2. Run `supabase/schema.sql` in SQL Editor to create the five operational tables and read-only authenticated access policies.
3. In **Table Editor**, import `assets.csv` into `assets`.
4. Import `findings.csv` into `findings`, then `work_orders.csv` into `work_orders`, `evidence.csv` into `evidence`, and `issue_history.csv` into `issue_history`. Match CSV headers to the identically named table columns. Import in this order to satisfy foreign keys.
5. Review row counts (10 assets, 10 findings, 5 work orders, 5 evidence rows, 9 history rows) and confirm employee references resolve to existing profiles.

Evidence rows store metadata and paths only. Upload the actual files separately to the Supabase Storage bucket if those files become available.
