begin;
-- The selected historical source stays pinned; metadata says whether its exact text was reviewed.
do $$declare definition text;previous text;begin
 definition:=pg_get_functiondef('internal.read_portfolio_page(integer,uuid,uuid,uuid)'::regprocedure);previous:=definition;
 definition:=replace(definition,'review.reviewed_at'||chr(10)||' from app.portfolio_items','review.reviewed_at,coalesce(review.source_review_confirmed,false)as source_review_confirmed'||chr(10)||' from app.portfolio_items');
 definition:=replace(definition,'''reviewedAt'',row_item.reviewed_at','''reviewedAt'',row_item.reviewed_at,''sourceWorkApproved'',row_item.source_review_confirmed');
 if definition=previous or position('as source_review_confirmed'in definition)=0 or position('''sourceWorkApproved'''in definition)=0 then raise exception 'Portfolio text approval metadata shape changed'using errcode='22023';end if;execute definition;
end$$;
commit;
