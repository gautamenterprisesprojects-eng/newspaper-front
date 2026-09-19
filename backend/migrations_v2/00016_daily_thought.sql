-- The masthead "सुविचार" (thought of the day) box, currently only Dainik
-- Miraz's own artwork -- see the generator's applyThoughtBoxToSvg. A free
-- text field the publisher can update at any time, unlike the settings page
-- (which locks after its first save): a suvichar changes per issue, so it
-- gets its own always-editable save endpoint rather than living behind
-- settings_locked.

ALTER TABLE publisher_profiles ADD COLUMN IF NOT EXISTS daily_thought TEXT NULL;
