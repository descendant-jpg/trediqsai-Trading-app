import { createClient } from '@supabase/supabase-js';

const targetEmail = 'nextgensynthex@gmail.com';
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured before promoting an admin.',
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
}

const user = await findUserByEmail(targetEmail);
if (!user) {
  throw new Error(`No authenticated user was found for ${targetEmail}.`);
}

const { data: profile, error } = await supabase
  .from('profiles')
  .update({ role: 'admin' })
  .eq('id', user.id)
  .select('id, email, username, role')
  .single();

if (error) {
  if (error.code === '42703' || error.code === 'PGRST204') {
    throw new Error(
      'The profiles.role column is missing. Apply supabase/migrations/017_admin_roles.sql in the Supabase SQL editor, then rerun this script.',
    );
  }
  throw error;
}

console.log('Admin promotion completed:', profile);