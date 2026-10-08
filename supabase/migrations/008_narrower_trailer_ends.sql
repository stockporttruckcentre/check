-- =============================================================
-- 008. The rear and front drawings narrowed to a real trailer's end.
--
-- The pack drew both ends nearly twice as wide as a real trailer. The
-- drawings are now narrowed about the middle (0.55), so the damage zones
-- for those two views move with them. Applied to every checklist version.
--
-- Safe to run twice: it writes the same values each time.
-- =============================================================

update config_versions set config = jsonb_set(jsonb_set(config, '{zones,rear}', '[{"name": "left lamp", "x0": 0.395, "y0": 0.62, "x1": 0.445, "y1": 0.78}, {"name": "right lamp", "x0": 0.555, "y0": 0.62, "x1": 0.605, "y1": 0.78}, {"name": "under run", "x0": 0.395, "y0": 0.78, "x1": 0.605, "y1": 1}, {"name": "left door", "x0": 0.335, "y0": 0, "x1": 0.5, "y1": 0.62}, {"name": "right door", "x0": 0.5, "y0": 0, "x1": 0.665, "y1": 0.62}]'::jsonb), '{zones,front}', '[{"name": "couplings", "x0": 0.467, "y0": 0.68, "x1": 0.533, "y1": 0.95}, {"name": "landing gear", "x0": 0.39, "y0": 0.73, "x1": 0.61, "y1": 1}, {"name": "front panel", "x0": 0.335, "y0": 0, "x1": 0.665, "y1": 0.73}]'::jsonb), updated_at = now() where config ? 'zones';
