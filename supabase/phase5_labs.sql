-- Lab files (PDFs and photos)
create table if not exists lab_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  file_name text not null,
  file_path text,
  file_type text,
  date date,
  extracted_text text,
  created_at timestamptz default now()
);

alter table lab_files enable row level security;
create policy "user lab_files" on lab_files for all using (auth.uid() = user_id);

-- Extracted biomarkers for trend charts
create table if not exists lab_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  lab_file_id uuid references lab_files(id) on delete cascade not null,
  marker text not null,
  value numeric,
  unit text,
  date date not null,
  created_at timestamptz default now()
);

alter table lab_results enable row level security;
create policy "user lab_results" on lab_results for all using (auth.uid() = user_id);

-- Supabase Storage bucket (run manually in dashboard or via CLI):
-- insert into storage.buckets (id, name, public) values ('lab-files', 'lab-files', false);
-- create policy "user lab files storage" on storage.objects for all using (auth.uid()::text = (storage.foldername(name))[1]);
