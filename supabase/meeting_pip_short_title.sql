-- Short Pip-generated title for each meeting — drives the label shown on
-- the Calendar view so entries scan like email subjects ("Dan integration
-- request") instead of redundant date-stamped strings.
--
-- Populated by Pip during summarizeDraftPip + extractTouchpointActionsPip.
-- Safe to run multiple times.

alter table folio_meetings add column if not exists pip_short_title text;
