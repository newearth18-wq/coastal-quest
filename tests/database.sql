-- QA fixtures are created and removed in the same transaction. Existing app data is never selected or changed.
do $$
declare owner_id uuid:=gen_random_uuid(); bank_id uuid; team_room uuid; boss_room uuid; p1 uuid; p2 uuid; qid uuid; result jsonb; before_left bigint; after_left bigint;
begin
  bank_id:=public.cq_save_bank(owner_id,null,'QA Coastal transaction test','QA','QA','[{"prompt":"QA one","options":["A","B","C","D"],"correct":0,"explanation":"QA"},{"prompt":"QA two","options":["A","B","C","D"],"correct":1,"explanation":"QA"}]',100000);
  begin perform public.cq_save_bank(gen_random_uuid(),bank_id,'Other','QA','QA','[]',100000); raise exception 'Ownership check did not reject'; exception when raise_exception then if sqlerrm <> 'NOT_OWNER' then raise; end if; end;
  team_room:=public.cq_create_room(owner_id,false,'000091','QA Coastal teams','QA','teams','lobby',2,12,900,null,'[{"prompt":"Snapshot one","options":["A","B","C","D"],"correct":0,"explanation":"QA"},{"prompt":"Snapshot two","options":["A","B","C","D"],"correct":1,"explanation":"QA"}]',100000);
  p1:=public.cq_join_room(team_room,'QA One',1,gen_random_uuid()::text,100000);p2:=public.cq_join_room(team_room,'QA Two',1,gen_random_uuid()::text,100000);
  perform public.cq_control_room(team_room,owner_id,'playing',100000);
  select id into qid from public.cq_room_questions where room_id=team_room order by position limit 1;
  result:=public.cq_submit_answer(team_room,p1,qid,0,101000); assert (result->>'correct')::boolean and (result->'reward'->>'ammo')::int=12;
  result:=public.cq_submit_answer(team_room,p2,qid,0,101001);assert (select sum(score) from public.cq_room_totals(team_room) where team=1)=200;
  assert (select correct from public.cq_room_analytics(team_room) where qposition=0)=2;
  perform public.cq_control_room(team_room,owner_id,'paused',102000);
  select id into qid from public.cq_room_questions where room_id=team_room and position=1;
  begin perform public.cq_submit_answer(team_room,p1,qid,1,103000);raise exception 'Pause failed';exception when raise_exception then if sqlerrm<>'ROOM_CLOSED' then raise;end if;end;
  perform public.cq_control_room(team_room,owner_id,'playing',112000);assert (select paused_ms from public.cq_rooms where id=team_room)=10000;
  result:=public.cq_submit_answer(team_room,p1,qid,1,113000);assert (result->>'correct')::boolean;
  perform public.cq_save_bank(owner_id,bank_id,'Changed','QA','QA','[{"prompt":"Changed question","options":["A","B","C","D"],"correct":0,"explanation":""}]',114000);
  assert (select prompt from public.cq_room_questions where room_id=team_room and position=0)='Snapshot one';
  boss_room:=public.cq_create_room(owner_id,false,'000092','QA Coastal boss','QA','boss','playing',2,1,900,100000,'[{"prompt":"Boss one","options":["A","B","C","D"],"correct":0,"explanation":""}]',100000);
  p1:=public.cq_join_room(boss_room,'QA One',0,gen_random_uuid()::text,100000);p2:=public.cq_join_room(boss_room,'QA Two',0,gen_random_uuid()::text,100000);
  select id into qid from public.cq_room_questions where room_id=boss_room limit 1;
  perform public.cq_submit_answer(boss_room,p1,qid,0,101000);
  begin perform public.cq_submit_answer(boss_room,p2,qid,0,101001);raise exception 'Boss target failed';exception when raise_exception then if sqlerrm<>'ROOM_CLOSED' then raise;end if;end;
  perform public.cq_control_room(team_room,owner_id,'finished',115000);
  begin perform public.cq_join_room(team_room,'QA Late',1,gen_random_uuid()::text,116000);raise exception 'Finished join failed';exception when raise_exception then if sqlerrm<>'ROOM_CLOSED' then raise;end if;end;
  delete from public.cq_rooms where id in (team_room,boss_room);delete from public.cq_banks where id=bank_id;
end $$;
select 'PASSED' as result, 'bank ownership, teams, analytics, pause/resume, snapshot, boss target, finished join; QA rows removed' as checks;
