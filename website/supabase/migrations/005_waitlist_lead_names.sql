-- Forward-only CMS upgrade: the original launch-leads migration predates name capture.
-- Keep names optional so earlier email-only signups remain valid.
alter table waitlist
  add column if not exists name text;