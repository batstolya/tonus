-- Reply language for AI text generated outside a browser request.
--
-- The web client sends `lang` with every edge-function call, but cron paths
-- (weekly coach digest, Telegram messages) have no request to read it from and
-- used to fall back to Russian for everyone. The client mirrors the picked
-- language here so background jobs can address the user in their language.
alter table public.profiles
  add column if not exists lang text;

do $c$ begin
  alter table public.profiles
    add constraint profiles_lang_check check (lang is null or lang in ('ru', 'uk', 'en'));
exception when duplicate_object then null; end $c$;
