-- Only service_role can invoke these functions. They run with caller privileges.
create or replace function public.cq_submit_answer(_room uuid, _player uuid, _question uuid, _choice int, _now bigint)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare r cq_rooms%rowtype; q cq_room_questions%rowtype; n int; hits int; is_correct boolean;
begin
  select * into r from cq_rooms where id=_room for update;
  if not found or r.status <> 'playing' or (r.started_at is not null and _now-r.started_at-r.paused_ms >= r.duration::bigint*1000) then raise exception 'ROOM_CLOSED'; end if;
  if not exists(select 1 from cq_players where id=_player and room_id=_room) then raise exception 'NOT_MEMBER'; end if;
  if r.mode='boss' then
    select count(*) into hits from cq_answers where room_id=_room and correct;
    if hits >= r.boss_target then raise exception 'ROOM_CLOSED'; end if;
  end if;
  select x.* into q from cq_room_questions x where x.room_id=_room and not exists(select 1 from cq_answers a where a.player_id=_player and a.question_id=x.id) order by x.position limit 1;
  if not found or q.id <> _question then raise exception 'QUESTION_NOT_CURRENT'; end if;
  if _choice not between 0 and 3 then raise exception 'INVALID_CHOICE'; end if;
  is_correct := _choice=q.correct;
  insert into cq_answers(room_id,player_id,question_id,choice,correct,created_at) values(_room,_player,_question,_choice,is_correct,_now);
  select count(*) into n from cq_answers where player_id=_player and correct;
  return jsonb_build_object('correct',is_correct,'correctIndex',q.correct,'explanation',q.explanation,'reward',jsonb_build_object('ammo',case when is_correct then 12 else 0 end,'energy',case when is_correct then 20 else 0 end,'item',case when is_correct and n%3=0 then 'shield' else null end));
end $$;

create or replace function public.cq_control_room(_room uuid, _owner uuid, _status text, _now bigint)
returns void language plpgsql security invoker set search_path = public as $$
declare r cq_rooms%rowtype;
begin
  select * into r from cq_rooms where id=_room and owner=_owner for update;
  if not found or r.status='finished' then raise exception 'ROOM_CLOSED'; end if;
  if _status not in ('playing','paused','finished') or (_status='paused' and r.status<>'playing') or (_status='playing' and r.status not in ('lobby','paused')) then raise exception 'INVALID_TRANSITION'; end if;
  update cq_rooms set status=_status, started_at=coalesce(started_at,case when _status='playing' then _now end),
    paused_at=case when _status='paused' then _now when _status='finished' then coalesce(paused_at,_now) else null end,
    paused_ms=paused_ms+case when paused_at is not null and _status='playing' then _now-paused_at else 0 end
    where id=_room;
end $$;

create or replace function public.cq_join_room(_room uuid, _name text, _team int, _token_hash text, _now bigint)
returns uuid language plpgsql security invoker set search_path = public as $$
declare pid uuid; r cq_rooms%rowtype;
begin
  select * into r from cq_rooms where id=_room for update;
  if not found or r.status='finished' or (r.started_at is not null and coalesce(r.paused_at,_now)-r.started_at-r.paused_ms >= r.duration::bigint*1000) then raise exception 'ROOM_CLOSED'; end if;
  if r.mode='boss' and (select count(*) from cq_answers where room_id=_room and correct)>=r.boss_target then raise exception 'ROOM_CLOSED'; end if;
  if (select count(*) from cq_players where room_id=_room) >=60 then raise exception 'ROOM_FULL'; end if;
  if exists(select 1 from cq_players where room_id=_room and name=_name) then raise exception 'NAME_TAKEN'; end if;
  insert into cq_players(room_id,name,team,token_hash,created_at) values(_room,_name,case when r.mode='teams' then greatest(1,least(r.team_count,_team)) else 0 end,_token_hash,_now) returning id into pid;
  return pid;
end $$;

revoke all on function public.cq_submit_answer(uuid,uuid,uuid,int,bigint), public.cq_control_room(uuid,uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.cq_submit_answer(uuid,uuid,uuid,int,bigint), public.cq_control_room(uuid,uuid,text,bigint) to service_role;

-- Broadcast only an invalidation flag; names, answer keys and scores stay behind the authenticated API.
create or replace function public.cq_notify_room()
returns trigger language plpgsql security invoker set search_path = public as $$
declare room_pin text;
begin
  if tg_table_name='cq_rooms' then room_pin:=new.pin;
  else select pin into room_pin from cq_rooms where id=new.room_id; end if;
  perform realtime.send('{"changed":true}'::jsonb,'changed','coastal:'||room_pin,false);
  return new;
end $$;
revoke all on function public.cq_notify_room() from public, anon, authenticated;
grant execute on function public.cq_notify_room() to service_role;
create trigger cq_rooms_notify after update on public.cq_rooms for each row execute function public.cq_notify_room();
create trigger cq_players_notify after insert on public.cq_players for each row execute function public.cq_notify_room();
create trigger cq_answers_notify after insert on public.cq_answers for each row execute function public.cq_notify_room();
