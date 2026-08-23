-- Persist the server-validated AutoPilot market preference for existing rows.
-- Apply with the workspace database migration process before deploying the
-- matching API build to an already-provisioned database.
alter table autopilot_state
  add column if not exists selected_asset text not null default 'Forex';

alter table autopilot_state
  drop constraint if exists autopilot_state_selected_asset_check;

alter table autopilot_state
  add constraint autopilot_state_selected_asset_check
  check (selected_asset in ('Forex', 'Crypto', 'Stocks'));