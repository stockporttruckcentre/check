-- =============================================================
-- 010. Left and right wheels on the rear view.
--
-- A mark on the rear wheels was named "Rear, under run". The wheels
-- have their own areas now, checked before the under run, on every
-- checklist version.
--
-- Safe to run twice: a version that already has them is left alone.
-- =============================================================

update config_versions
   set config = jsonb_insert(jsonb_insert(config, '{zones,rear,2}', '{"name":"right wheels","x0":0.55,"y0":0.78,"x1":0.61,"y1":1}'::jsonb),
                             '{zones,rear,2}', '{"name":"left wheels","x0":0.39,"y0":0.78,"x1":0.45,"y1":1}'::jsonb),
       updated_at = now()
 where config ? 'zones' and not (config->'zones'->'rear') @> '[{"name":"left wheels"}]'::jsonb;
