drop policy if exists "User can insert eventos" on public.evento;

create policy "User can insert eventos"
on public.evento
for insert
to public
with check (auth.uid() is not null);
;
