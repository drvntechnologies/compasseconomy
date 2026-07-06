import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bgbfknpzkidqodagqvna.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmZrbnB6a2lkcW9kYWdxdm5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDM2ODMsImV4cCI6MjA5ODUxOTY4M30.Y7SjLfE5wb4iU0ooOlazTYVN7mOtSITRxB9xq6LEh1I';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
