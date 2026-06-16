-- Health concerns (список проблем)
create table if not exists health_concerns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  category text not null default 'other', -- skin | hair | breathing | gut | other
  status text not null default 'active', -- active | improving | resolved
  started_at date,
  notes text,
  created_at timestamptz default now()
);
alter table health_concerns enable row level security;
create policy "own" on health_concerns using (auth.uid() = user_id);

-- Observation logs per concern
create table if not exists concern_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  concern_id uuid references health_concerns(id) on delete cascade not null,
  date date not null default current_date,
  severity integer check (severity between 1 and 5),
  note text,
  photo_path text,
  created_at timestamptz default now()
);
alter table concern_logs enable row level security;
create policy "own" on concern_logs using (auth.uid() = user_id);

-- Hair entries (monthly check-ins)
create table if not exists hair_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null default current_date,
  shedding_level integer check (shedding_level between 1 and 5),
  density_rating integer check (density_rating between 1 and 5),
  hairline_rating integer check (hairline_rating between 1 and 5),
  scalp_note text,
  photo_top text,
  photo_hairline text,
  photo_temples text,
  notes text,
  created_at timestamptz default now(),
  unique(user_id, date)
);
alter table hair_entries enable row level security;
create policy "own" on hair_entries using (auth.uid() = user_id);

-- Storage buckets (run separately if needed)
-- insert into storage.buckets (id, name, public) values ('health-photos', 'health-photos', false) on conflict do nothing;
