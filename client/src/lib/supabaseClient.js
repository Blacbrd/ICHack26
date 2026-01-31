import { createClient } from '@supabase/supabase-js';

// Replace these with your Supabase project URL and anon key
// Get these from: Supabase Dashboard > Project Settings > API
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

