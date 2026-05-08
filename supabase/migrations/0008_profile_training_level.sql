alter table public.profiles
  add column if not exists training_level text
  check (training_level in ('beginner', 'intermediate', 'advanced'));
