begin;
-- HTTP delivery must allow the bounded 20-second handler and finish receipt.
-- Existing five-second SQL limits and the 60-second invocation lease remain unchanged.
do $$declare definition text;anchor text:='timeout_milliseconds:=1000';begin
 definition:=pg_get_functiondef('internal.send_worker_wake(uuid,text,text)'::regprocedure);
 if position(anchor in definition)=0 or position('timeout_milliseconds:=30000'in definition)>0 then raise exception 'Worker wake delivery timeout boundary changed'using errcode='22023';end if;
 execute replace(definition,anchor,'timeout_milliseconds:=30000');
end$$;
commit;
