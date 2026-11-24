-- =============================================================
-- 009. A sideguard damage area on the nearside and offside drawings.
--
-- A pin on the sideguard was named "Nearside, chassis". The sideguard
-- has its own area now, checked before the chassis, on every checklist
-- version.
--
-- Safe to run twice: a version that already has it is left alone.
-- =============================================================

update config_versions
   set config = jsonb_insert(jsonb_insert(config, '{zones,ns,2}', '{"name":"sideguard","x0":0.29,"y0":0.74,"x1":0.69,"y1":0.92}'::jsonb),
                             '{zones,os,2}', '{"name":"sideguard","x0":0.31,"y0":0.74,"x1":0.71,"y1":0.92}'::jsonb),
       updated_at = now()
 where config ? 'zones' and not (config->'zones'->'ns') @> '[{"name":"sideguard"}]'::jsonb;
