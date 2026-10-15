import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL || '';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
export const configured = !!url && !!key;
export const apiUrl = configured ? url.replace(/\/$/, '') + '/functions/v1/coastal-classroom' : '';
export const publicKey = key;
export const supabase = createClient(url || 'https://unconfigured.invalid', key || 'unconfigured', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'coastal-quest-teacher' },
});
