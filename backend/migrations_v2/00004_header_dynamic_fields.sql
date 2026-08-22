-- Feeds the generator's dynamic header overlay (day/date, issue/Ank, price,
-- and an auto "Year-N" label drawn over the publisher's own uploaded header
-- artwork). cover_price is left as free text (publishers write "Rs. 5",
-- "₹5", etc. themselves) rather than a strict numeric type, matching how
-- price already appears elsewhere in this schema. publication_start_year is
-- the only new number -- the generator computes "Year-N" from it each run,
-- so nothing here goes stale.

ALTER TABLE publisher_profiles ADD COLUMN IF NOT EXISTS cover_price VARCHAR(50) NULL;
ALTER TABLE publisher_profiles ADD COLUMN IF NOT EXISTS publication_start_year INTEGER NULL;
