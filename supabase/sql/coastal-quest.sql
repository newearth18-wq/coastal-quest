create table public.cq_banks (id uuid primary key default gen_random_uuid(), owner uuid not null, title text not null, subject text not null, grade text not null default '', created_at bigint not null);
create index banks_owner on public.cq_banks(owner);
create table public.cq_questions (id uuid primary key default gen_random_uuid(), bank_id uuid not null references public.cq_banks(id) on delete cascade, position int not null, prompt text not null, options jsonb not null, correct int not null check (correct between 0 and 3), explanation text not null default '');
create index questions_bank on public.cq_questions(bank_id);
create table public.cq_rooms (id uuid primary key default gen_random_uuid(), pin text not null unique check (pin ~ '^\d{6}$'), owner uuid, is_practice boolean not null default false, title text not null, subject text not null, mode text not null check (mode in ('solo','teams','boss')), status text not null check (status in ('lobby','playing','paused','finished')), team_count int not null, boss_target int not null, duration int not null, started_at bigint, paused_at bigint, paused_ms bigint not null default 0, created_at bigint not null);
create index rooms_owner on public.cq_rooms(owner);
create table public.cq_room_questions (id uuid primary key default gen_random_uuid(), room_id uuid not null references public.cq_rooms(id) on delete cascade, position int not null, prompt text not null, options jsonb not null, correct int not null, explanation text not null default '');
create index room_questions_room on public.cq_room_questions(room_id);
create table public.cq_players (id uuid primary key default gen_random_uuid(), room_id uuid not null references public.cq_rooms(id) on delete cascade, name text not null, team int not null, token_hash text not null unique, created_at bigint not null, unique(room_id,name));
create index players_room on public.cq_players(room_id);
create table public.cq_answers (id uuid primary key default gen_random_uuid(), room_id uuid not null references public.cq_rooms(id) on delete cascade, player_id uuid not null references public.cq_players(id) on delete cascade, question_id uuid not null references public.cq_room_questions(id) on delete cascade, choice int not null, correct boolean not null, created_at bigint not null, unique(player_id,question_id));
create index answers_room on public.cq_answers(room_id);



grant all on public.cq_banks, public.cq_questions, public.cq_rooms, public.cq_room_questions, public.cq_players, public.cq_answers to service_role;

alter table public.cq_banks enable row level security;
alter table public.cq_questions enable row level security;
alter table public.cq_rooms enable row level security;
alter table public.cq_room_questions enable row level security;
alter table public.cq_players enable row level security;
alter table public.cq_answers enable row level security;





-- cq_room_questions, cq_players, cq_answers: no client policies; only the server (service role) touches them.

create or replace function public.cq_room_totals(_room uuid)
returns table(id uuid, name text, team int, answered bigint, correct bigint, score bigint)
language sql stable security invoker set search_path = public as $$
  select p.id, p.name, p.team, count(a.id), coalesce(sum(a.correct::int),0), coalesce(sum(a.correct::int),0)*100
  from cq_players p left join cq_answers a on a.player_id = p.id
  where p.room_id = _room group by p.id order by 6 desc, p.created_at asc $$;

create or replace function public.cq_room_analytics(_room uuid)
returns table(qposition int, prompt text, answered bigint, correct bigint)
language sql stable security invoker set search_path = public as $$
  select q.position, q.prompt, count(a.id), coalesce(sum(a.correct::int),0)
  from cq_room_questions q left join cq_answers a on a.question_id = q.id
  where q.room_id = _room group by q.id order by q.position $$;

create or replace function public.cq_next_question(_room uuid, _player uuid)
returns table(id uuid, prompt text, options jsonb, qposition int, correct int, explanation text)
language sql stable security invoker set search_path = public as $$
  select q.id, q.prompt, q.options, q.position, q.correct, q.explanation from cq_room_questions q
  where q.room_id = _room and not exists(select 1 from cq_answers a where a.player_id = _player and a.question_id = q.id)
  order by q.position limit 1 $$;

create or replace function public.cq_join_room(_room uuid, _name text, _team int, _token_hash text, _now bigint)
returns uuid language plpgsql security invoker set search_path = public as $$
declare pid uuid;
begin
  perform 1 from cq_rooms where id = _room for update;
  if (select count(*) from cq_players where room_id = _room) >= 60 then raise exception 'ROOM_FULL'; end if;
  if exists(select 1 from cq_players where room_id = _room and name = _name) then raise exception 'NAME_TAKEN'; end if;
  insert into cq_players(room_id,name,team,token_hash,created_at) values(_room,_name,_team,_token_hash,_now) returning id into pid;
  return pid;
end $$;

create or replace function public.cq_save_bank(_owner uuid, _id uuid, _title text, _subject text, _grade text, _questions jsonb, _now bigint)
returns uuid language plpgsql security invoker set search_path = public as $$
declare bid uuid := coalesce(_id, gen_random_uuid());
begin
  if _id is not null and not exists(select 1 from cq_banks where id=_id and owner=_owner) then raise exception 'NOT_OWNER'; end if;
  insert into cq_banks(id,owner,title,subject,grade,created_at) values(bid,_owner,_title,_subject,_grade,_now)
    on conflict (id) do update set title=excluded.title, subject=excluded.subject, grade=excluded.grade;
  delete from cq_questions where bank_id = bid;
  insert into cq_questions(bank_id,position,prompt,options,correct,explanation)
    select bid, (e.ord-1)::int, e.q->>'prompt', e.q->'options', (e.q->>'correct')::int, coalesce(e.q->>'explanation','')
    from jsonb_array_elements(_questions) with ordinality as e(q,ord);
  return bid;
end $$;

create or replace function public.cq_create_room(_owner uuid, _practice boolean, _pin text, _title text, _subject text, _mode text, _status text, _teams int, _target int, _duration int, _started bigint, _questions jsonb, _now bigint)
returns uuid language plpgsql security invoker set search_path = public as $$
declare rid uuid;
begin
  insert into cq_rooms(pin,owner,is_practice,title,subject,mode,status,team_count,boss_target,duration,started_at,created_at)
    values(_pin,_owner,_practice,_title,_subject,_mode,_status,_teams,_target,_duration,_started,_now) returning id into rid;
  insert into cq_room_questions(room_id,position,prompt,options,correct,explanation)
    select rid, (e.ord-1)::int, e.q->>'prompt', e.q->'options', (e.q->>'correct')::int, coalesce(e.q->>'explanation','')
    from jsonb_array_elements(_questions) with ordinality as e(q,ord);
  return rid;
end $$;

revoke all on function public.cq_room_totals(uuid), public.cq_room_analytics(uuid), public.cq_next_question(uuid,uuid), public.cq_join_room(uuid,text,int,text,bigint), public.cq_save_bank(uuid,uuid,text,text,text,jsonb,bigint), public.cq_create_room(uuid,boolean,text,text,text,text,text,int,int,int,bigint,jsonb,bigint) from public, anon, authenticated;
grant execute on function public.cq_room_totals(uuid), public.cq_room_analytics(uuid), public.cq_next_question(uuid,uuid), public.cq_join_room(uuid,text,int,text,bigint), public.cq_save_bank(uuid,uuid,text,text,text,jsonb,bigint), public.cq_create_room(uuid,boolean,text,text,text,text,text,int,int,int,bigint,jsonb,bigint) to service_role;

revoke all on public.cq_banks, public.cq_questions, public.cq_rooms, public.cq_room_questions, public.cq_players, public.cq_answers from anon, authenticated;
