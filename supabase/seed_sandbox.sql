-- ─────────────────────────────────────────────────────────────────────────
-- Sandbox seed — MAX COVERAGE edition.
-- Populates the stress-test / sandbox user with a realistic mock world and
-- fills EVERY fillable field on every record, so the stress-bot and Pip
-- exercise every surface (all account types, all project statuses, all
-- meeting metadata, partner/agreement fields, custom fields, etc).
--
-- User resolved BY EMAIL (no hardcoded UUID). Idempotent: wipes the sandbox
-- user's rows first, then reseeds. Run via Supabase SQL / MCP.
--
-- Target: chris.vasconcellos97+sandbox@gmail.com  (display name: Luca Duca)
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  uid uuid;
  v_email text := 'chris.vasconcellos97+sandbox@gmail.com';
  v_schema jsonb := '[{"key":"priority","label":"Priority","type":"dropdown","options":["High","Medium","Low"],"builtin":true},{"key":"owner","label":"Owner","type":"person","builtin":true},{"key":"submission_date","label":"Submission Date","type":"date","builtin":true},{"key":"due_date","label":"Due Date","type":"date","builtin":true},{"key":"description","label":"Description","type":"longtext","builtin":true},{"key":"related_link","label":"Related Link","type":"url","builtin":true}]'::jsonb;
  v_cols jsonb := '["intake","in_progress","done"]'::jsonb;

  a_apex uuid := gen_random_uuid(); a_cascade uuid := gen_random_uuid();
  a_summit uuid := gen_random_uuid(); a_summit_dt uuid := gen_random_uuid();
  a_summit_ws uuid := gen_random_uuid(); a_granite uuid := gen_random_uuid();
  a_northwind uuid := gen_random_uuid(); a_product uuid := gen_random_uuid();
  a_liberty uuid := gen_random_uuid(); a_pacific uuid := gen_random_uuid();

  c_sarah uuid := gen_random_uuid(); c_mike uuid := gen_random_uuid();
  c_jen uuid := gen_random_uuid(); c_david uuid := gen_random_uuid();
  c_priya uuid := gen_random_uuid(); c_tom uuid := gen_random_uuid();

  m_apex1 uuid := gen_random_uuid(); m_apex2 uuid := gen_random_uuid();
  m_summit uuid := gen_random_uuid(); m_north uuid := gen_random_uuid();
  m_cascade uuid := gen_random_uuid(); m_granite uuid := gen_random_uuid();

  cad_apex uuid := gen_random_uuid(); cad_summit uuid := gen_random_uuid();
  cad_product uuid := gen_random_uuid(); cad_priya uuid := gen_random_uuid();
  cad_cascade uuid := gen_random_uuid();

  p_apex uuid := gen_random_uuid(); p_apex_done uuid := gen_random_uuid();
  p_summit uuid := gen_random_uuid(); p_north uuid := gen_random_uuid();
  p_liberty uuid := gen_random_uuid(); p_pacific uuid := gen_random_uuid();
  p_draft uuid := gen_random_uuid(); p_board uuid := gen_random_uuid();
begin
  select id into uid from auth.users where email = v_email;
  if uid is null then raise exception 'Sandbox user % not found', v_email; end if;

  delete from folio_tasks where user_id = uid;
  delete from gauge_projects where user_id = uid;
  delete from folio_meetings where user_id = uid;
  delete from folio_cadences where user_id = uid;
  delete from folio_contacts where user_id = uid;
  delete from folio_account_snapshots where user_id = uid;
  delete from folio_accounts where user_id = uid;

  -- ── ACCOUNTS — every type, every field ───────────────────────────────
  insert into folio_accounts
    (id,user_id,owner_user_id,name,account_type,tier,status,objective,region,market_scope,
     serviced_states,tags,revenue,revenue_amount,spend_ytd,account_number,address,lat,lng,
     agreement_end_date,scope_summary,billing_terms,parent_account_id,is_my_department,systems,
     pip_account_summary,pip_account_summary_at,last_meeting,last_interaction_at,next_meeting,
     status_override,status_override_reason,status_override_at,status_override_until,created_at,updated_at)
  values
    (a_apex,uid,uid,'Apex Auto Group','standard','Major','green','Grow parts catalog coverage and lock in the multi-year supply agreement.','Southwest','regional',
     ARRAY['TX','OK','NM'],ARRAY['strategic','catalog','enterprise'],'$4.2M',4200000,310000,'APX-1001','1200 Industrial Pkwy, Dallas, TX',32.7767,-96.7970,
     (now()+interval '180 days')::date,'Full catalog + invoice feed integration across all Apex branches.','Net 30, quarterly true-up.',null,false,'["Triad WMS","Eagle DMS","NetSuite"]'::jsonb,
     'Major strategic account. Budget approved for Q3 catalog expansion. Watch invoice feed reliability.',now()-interval '10 days',(now()-interval '10 days')::date,now()-interval '10 days',(now()+interval '4 days')::date,
     null,null,null,null,now()-interval '300 days',now()-interval '10 days'),

    (a_cascade,uid,uid,'Cascade Parts Distributors','standard','Mid','green','Stabilize ordering cadence and improve invoice accuracy.','Pacific Northwest','regional',
     ARRAY['WA','OR'],ARRAY['distribution'],'$1.8M',1800000,142000,'CSC-2043','88 Harbor Way, Seattle, WA',47.6062,-122.3321,
     (now()+interval '95 days')::date,'Standard parts distribution agreement.','Net 45.',null,false,'["Eagle DMS"]'::jsonb,
     'Steady mid-tier account. Recurring invoice line-item errors worth resolving.',now()-interval '2 days',(now()-interval '2 days')::date,now()-interval '2 days',null,
     null,null,null,null,now()-interval '210 days',now()-interval '2 days'),

    (a_summit,uid,uid,'Summit Collision Centers','mso','Major','green','Connect all shop locations and roll out shared catalog integration.','Mountain','national',
     ARRAY['CO','UT','AZ'],ARRAY['mso','integration','multi-site'],'$6.5M',6500000,480000,'SMT-3000','500 Summit Blvd, Denver, CO',39.7392,-104.9903,
     (now()+interval '210 days')::date,'Master MSO agreement covering all current and future shop locations.','Net 30, consolidated billing.',null,false,'["CCC ONE","Triad WMS","Mitchell"]'::jsonb,
     'Largest account. Owner Jennifer wants a single shared integration across all shops. High upside.',now()-interval '5 days',(now()-interval '5 days')::date,now()-interval '5 days',(now()+interval '9 days')::date,
     null,null,null,null,now()-interval '180 days',now()-interval '5 days'),

    (a_summit_dt,uid,uid,'Summit Collision — Downtown','shop','Mid','green','Flagship downtown shop. Highest volume location.','Mountain','local',
     ARRAY['CO'],ARRAY['shop','flagship'],null,null,null,'SMT-3001','12 Larimer St, Denver, CO',39.7525,-104.9995,
     null,'Single-site connection under the Summit master agreement.','Billed via parent MSO.',a_summit,false,'["CCC ONE"]'::jsonb,
     'Flagship Summit shop, first integration target.',now()-interval '5 days',(now()-interval '5 days')::date,now()-interval '5 days',null,
     null,null,null,null,now()-interval '175 days',now()-interval '5 days'),

    (a_summit_ws,uid,uid,'Summit Collision — Westside','shop','Growth','yellow','Newer westside location, ramping volume.','Mountain','local',
     ARRAY['CO'],ARRAY['shop','ramping'],null,null,null,'SMT-3002','940 Wadsworth Blvd, Lakewood, CO',39.7047,-105.0814,
     null,'Single-site connection under the Summit master agreement.','Billed via parent MSO.',a_summit,false,'["CCC ONE"]'::jsonb,
     'Newer Summit shop still ramping. Connect after Downtown is live.',now()-interval '30 days',null,null,null,
     null,null,null,null,now()-interval '90 days',now()-interval '30 days'),

    (a_granite,uid,uid,'Granite Auto Parts','standard','Growth','red','Re-engage after a quiet stretch. Renewal risk if no contact soon.','Northeast','regional',
     ARRAY['NH','VT','ME'],ARRAY['at-risk','re-engage','renewal'],'$950K',950000,61000,'GRN-4410','7 Quarry Rd, Manchester, NH',42.9956,-71.4548,
     (now()+interval '40 days')::date,'Standard parts agreement, up for renewal soon.','Net 30.',null,false,'["Eagle DMS"]'::jsonb,
     'Cooling fast. No real contact in 7+ weeks. Renewal in ~40 days is at risk.',now()-interval '52 days',(now()-interval '52 days')::date,now()-interval '52 days',null,
     'red','Renewal risk — primary contact has gone quiet for over seven weeks.',now()-interval '6 days',(now()+interval '30 days')::date,now()-interval '260 days',now()-interval '6 days'),

    (a_northwind,uid,uid,'Northwind Aftermarket','partner','Mid','yellow','Co-marketing partner. Agreement renewal coming up this quarter.','Midwest','national',
     ARRAY['IL','WI','MN'],ARRAY['partner','renewal','co-marketing'],'$0',0,225000,'NWD-5500','300 Lakeshore Dr, Chicago, IL',41.8781,-87.6298,
     (now()+interval '14 days')::date,'Co-marketing + data-share partnership. Renewal expands co-marketing and reporting.','Quarterly retainer, Net 15.',null,false,'["HubSpot","Power BI"]'::jsonb,
     'Strategic partner. Renewal in two weeks; wants expanded co-marketing and better reporting.',now()-interval '20 days',(now()-interval '20 days')::date,now()-interval '20 days',(now()+interval '14 days')::date,
     'yellow','Renewal in progress — hold steady until package is signed.',now()-interval '20 days',(now()+interval '21 days')::date,now()-interval '400 days',now()-interval '20 days'),

    (a_product,uid,uid,'Product Team','internal_team','Mid','green','My team. Roadmap planning, integration tooling, and AM enablement.','Northeast','national',
     ARRAY['MA'],ARRAY['internal','my-team'],null,null,null,'INT-0001','100 Seaport Blvd, Boston, MA',42.3601,-71.0589,
     null,'Internal product team — not a customer agreement.','N/A — internal.',null,true,'["Linear","Figma","GitHub"]'::jsonb,
     'My own team. Owns integration tooling and AM enablement. Weekly standup + 1:1 with Priya.',now()-interval '3 days',(now()-interval '3 days')::date,now()-interval '3 days',(now()+interval '2 days')::date,
     null,null,null,null,now()-interval '150 days',now()-interval '3 days'),

    (a_liberty,uid,uid,'Liberty Salvage & Reman','standard','Growth','yellow','Reman supplier relationship. Exploring expanded parts feed.','Southeast','regional',
     ARRAY['GA','FL'],ARRAY['reman','supplier'],'$1.1M',1100000,88000,'LBT-6120','45 Foundry Ln, Atlanta, GA',33.7490,-84.3880,
     (now()+interval '120 days')::date,'Reman parts supply, evaluating expanded feed.','Net 60.',null,false,'["Eagle DMS"]'::jsonb,
     'Reman supplier. Exploring an expanded parts feed; project currently blocked on their list.',now()-interval '14 days',(now()-interval '14 days')::date,now()-interval '14 days',null,
     null,null,null,null,now()-interval '120 days',now()-interval '14 days'),

    (a_pacific,uid,uid,'Pacific Motors Collision','mso','Mid','yellow','Regional MSO. Three shops, evaluating full catalog connect.','West','regional',
     ARRAY['CA','NV'],ARRAY['mso','evaluating'],'$3.0M',3000000,210000,'PMC-7700','210 Bayfront Ave, San Diego, CA',32.7157,-117.1611,
     (now()+interval '150 days')::date,'Regional MSO agreement under evaluation for full catalog connect.','Net 30.',null,false,'["CCC ONE","Mitchell"]'::jsonb,
     'Three-shop regional MSO. Catalog-connect project on hold pending their internal decision.',now()-interval '30 days',(now()-interval '30 days')::date,now()-interval '30 days',null,
     null,null,null,null,now()-interval '140 days',now()-interval '30 days');

  -- ── CONTACTS — every field ───────────────────────────────────────────
  insert into folio_contacts
    (id,account_id,user_id,name,title,nickname,is_poc,is_primary,is_leader,email,phone,linkedin,
     notes,relationship_role,relationship_note,created_at)
  values
    (c_sarah,a_apex,uid,'Sarah Chen','VP Operations','Sarah',true,true,false,'sarah.chen@apexauto.example','214-555-0101','https://linkedin.com/in/sarahchen',
     'Decision maker on the supply agreement. Responsive, detail oriented.','champion','Approved Q3 budget. Replies within a day; our strongest advocate at Apex.',now()-interval '300 days'),
    (c_mike,a_apex,uid,'Mike Torres','Parts Manager','Mike',false,false,false,'mike.torres@apexauto.example','214-555-0144','https://linkedin.com/in/miketorres',
     'Day to day parts contact. Cares about fill rates.','neutral','Frustrated about fill rates on fast movers — keep him in the loop.',now()-interval '280 days'),
    (c_jen,a_summit,uid,'Jennifer Walsh','Owner','Jen',true,true,true,'jen.walsh@summitcollision.example','303-555-0188','https://linkedin.com/in/jenwalsh',
     'Owner across all Summit locations. Wants one integration to rule them all.','champion','Owns the whole MSO. Bought in on a single shared integration.',now()-interval '178 days'),
    (c_david,a_northwind,uid,'David Park','Partner Manager','Dave',true,false,false,'david.park@northwind.example','312-555-0170','https://linkedin.com/in/davidpark',
     'Manages the co-marketing relationship. Renewal owner on their side.','neutral','Renewal owner. Wants expanded co-marketing and clearer reporting.',now()-interval '395 days'),
    (c_priya,a_product,uid,'Priya Nair','Product Lead','Priya',false,false,true,'priya.nair@folioshq.com','617-555-0123','https://linkedin.com/in/priyanair',
     'Leads integrations roadmap. My weekly 1:1.','champion','My product lead. Weekly 1:1 on roadmap and tooling.',now()-interval '150 days'),
    (c_tom,a_granite,uid,'Tom Reed','General Manager','Tom',true,true,false,'tom.reed@graniteparts.example','603-555-0199','https://linkedin.com/in/tomreed',
     'Has gone quiet. Last real conversation was almost two months ago.','blocker','Noncommittal and unresponsive lately. Renewal risk if he stays dark.',now()-interval '255 days');

  -- ── CADENCES — every field ───────────────────────────────────────────
  insert into folio_cadences
    (id,user_id,account_id,frequency,type,cadence_scope,day_of_week,day_of_month,monthly_type,monthly_ordinal,
     meeting_time,default_attendees,is_global,task_title,notes,pip_brief,pip_brief_at,anchor_date,contact_id,created_at,updated_at)
  values
    (cad_apex,uid,a_apex,'biweekly','meeting','account',2,null,null,null,'10:00',ARRAY['Sarah Chen','Mike Torres'],false,null,
     'Biweekly check-in with Sarah. Catalog + agreement progress.','Lead with the Q3 pricing proposal status and reassure on the invoice feed fix. Sarah is your champion — keep momentum on the agreement.',now()-interval '10 days',(now()-interval '60 days')::date,null,now()-interval '60 days',now()-interval '10 days'),
    (cad_summit,uid,a_summit,'monthly','meeting','account',4,null,'day_of_week','second','14:00',ARRAY['Jennifer Walsh'],false,null,
     'Monthly integration sync with Jennifer.','Confirm Downtown as the first integration and lock a walkthrough date. Jennifer wants one integration across all shops.',now()-interval '5 days',(now()-interval '90 days')::date,null,now()-interval '90 days',now()-interval '5 days'),
    (cad_product,uid,a_product,'weekly','meeting','account',1,null,null,null,'09:00',ARRAY['Priya Nair','Team'],false,null,
     'Weekly team standup.','Review the integration tooling spec and Q3 roadmap one-pager progress.',now()-interval '3 days',(now()-interval '120 days')::date,null,now()-interval '120 days',now()-interval '3 days'),
    (cad_priya,uid,a_product,'weekly','meeting','person',3,null,null,null,'11:00',ARRAY['Priya Nair'],false,null,
     '1:1 with Priya on roadmap.','Check in on Priya''s priorities and the integration tooling spec. Surface any blockers early.',now()-interval '3 days',(now()-interval '100 days')::date,c_priya,now()-interval '100 days',now()-interval '3 days'),
    (cad_cascade,uid,a_cascade,'monthly','task','account',null,1,'day_of_month',null,null,null,false,'Reconcile Cascade monthly invoices',
     'Monthly invoice reconciliation reminder.',null,null,(now()-interval '45 days')::date,null,now()-interval '45 days',now()-interval '45 days');

  -- ── MEETINGS — every field ───────────────────────────────────────────
  insert into folio_meetings
    (id,account_id,user_id,title,pip_short_title,meeting_date,meeting_time,scheduled_time,notes,talking_points,
     action_items,commitments,agenda,method,status,rating,attendees,secondary_account_ids,cadence_id,
     discussed_project_ids,pip_summary,pip_email,pip_tone,theme,follow_up_date,plan_applied_at,created_at,updated_at)
  values
    (m_apex1,a_apex,uid,'Apex biweekly — catalog + agreement','Apex Q3 catalog go, feed fix pending',(now()-interval '10 days')::date,'10:00','10:00:00',
     'Walked through Q3 catalog expansion. Sarah confirmed budget approved for the new lines. Open question on invoice feed reliability — a few sync gaps last month. Agreed I would send the Q3 pricing proposal and get the invoice feed issue into Product.',
     'Q3 catalog lines; invoice feed reliability; multi-year agreement timeline.',
     'Send Q3 pricing proposal; escalate invoice feed sync gaps to Product.',
     'I will send the Q3 pricing proposal this week and escalate the feed fix.',
     'Catalog expansion review + agreement check-in.','video','summarized',5,ARRAY['Sarah Chen','Mike Torres'],null,cad_apex,
     ARRAY[p_apex],'Strong meeting. Budget for Q3 catalog lines is approved. The one risk is invoice feed reliability — recurring sync gaps that Sarah flagged. Next step is the Q3 pricing proposal plus a Product fix for the feed.',
     'Hi Sarah, great catching up today. To recap: Q3 catalog lines are a go, and I will send the pricing proposal this week. I am also escalating the invoice feed sync gaps to our Product team. Thanks again, Luca.',
     'positive','pricing',(now()+interval '4 days')::date,now()-interval '9 days',now()-interval '10 days',now()-interval '9 days'),

    (m_apex2,a_apex,uid,'Apex check-in — fill rates','Apex fill-rate friction',(now()-interval '32 days')::date,'10:00','10:00:00',
     'Mike raised fill-rate concerns on fast-moving SKUs. Some friction but workable. Sarah was not on this one.',
     'Fill rates on fast movers; backorder visibility.','Pull fill-rate report for top 20 SKUs.','Share a fill-rate report next cycle.',
     'Operational check-in on fulfillment.','phone','summarized',3,ARRAY['Mike Torres'],null,cad_apex,
     null,'Mid tone. Mike is frustrated with fill rates on a handful of SKUs. Not a relationship risk yet but worth watching.',
     null,'mixed','fulfillment',null,now()-interval '31 days',now()-interval '32 days',now()-interval '31 days'),

    (m_summit,a_summit,uid,'Summit monthly — integration kickoff','Summit integration: Downtown first',(now()-interval '5 days')::date,'14:00','14:00:00',
     'Reviewed the shop list. Jennifer wants all locations connected under one catalog. Downtown is highest priority. Westside still ramping. Need to schedule a walkthrough.',
     'Shop list; single shared integration; Downtown priority; walkthrough scheduling.',
     'Schedule Downtown walkthrough; confirm shop list completeness.','Walkthrough scheduled within two weeks.',
     'Integration kickoff across all Summit shops.','video','summarized',4,ARRAY['Jennifer Walsh'],ARRAY[a_summit_dt,a_summit_ws],cad_summit,
     ARRAY[p_summit],'Productive kickoff. Jennifer is bought in on a single shared integration across all Summit shops, Downtown first. Action: schedule the shop walkthrough.',
     'Hi Jennifer, thanks for the kickoff. Confirming we will start with Downtown and schedule a walkthrough shortly. Excited to get Summit fully connected. Luca.',
     'neutral','integration',(now()+interval '9 days')::date,now()-interval '4 days',now()-interval '5 days',now()-interval '4 days'),

    (m_north,a_northwind,uid,'Northwind — renewal scoping','Northwind renewal: expand co-marketing',(now()-interval '20 days')::date,'13:00','13:00:00',
     'David walked through what they want in the renewal. Mostly positive. They want expanded co-marketing and clearer reporting. Renewal lands in about two weeks.',
     'Renewal scope; expanded co-marketing; reporting requirements.','Build renewal package; draft reporting mockup.','Send renewal package within the week.',
     'Renewal scoping conversation.','video','summarized',4,ARRAY['David Park'],null,null,
     ARRAY[p_north],'Positive renewal conversation. Northwind wants expanded co-marketing and better reporting in the new agreement. Renewal is roughly two weeks out — prep the package.',
     'Hi David, thanks for scoping the renewal. I will pull together a package covering expanded co-marketing and the reporting you asked for. Talk soon, Luca.',
     'positive','renewal',(now()+interval '14 days')::date,now()-interval '19 days',now()-interval '20 days',now()-interval '19 days'),

    (m_cascade,a_cascade,uid,'Cascade — quick invoice note',null,(now()-interval '2 days')::date,'15:30','15:30:00',
     'Quick call. Two invoices had wrong line items again. Pulling the details before next sync.',
     'Invoice line-item errors.','Pull invoice details before next sync.',null,
     'Quick invoice issue call.','phone','draft',null,ARRAY['Mike Torres'],null,null,
     null,null,null,null,null,null,null,now()-interval '2 days',now()-interval '2 days'),

    (m_granite,a_granite,uid,'Granite — last touch','Granite cooling, no commitment',(now()-interval '52 days')::date,'09:30','09:30:00',
     'Brief check-in with Tom. Noncommittal. Said things are busy and he would circle back. Has not since.',
     'General check-in; renewal timing.','Follow up to re-engage Tom.','None — Tom was noncommittal.',
     'Relationship check-in.','phone','summarized',2,ARRAY['Tom Reed'],null,null,
     null,'Cooling. Tom was noncommittal and has gone quiet since. Renewal risk if there is no contact soon — this account has been cold for over seven weeks.',
     null,'negative','retention',null,now()-interval '51 days',now()-interval '52 days',now()-interval '51 days');

  -- ── GAUGE PROJECTS — every status, every field ───────────────────────
  insert into gauge_projects
    (id,user_id,account_id,account_ids,meeting_id,title,description,status,priority,scope,is_standing,
     blocked_reason,assignee,requested_by,requested_at,stages,custom_field_schema,task_status_columns,
     notes,total_duration_days,start_date,due_date,expected_complete_date,status_updates,created_at,updated_at)
  values
    (p_apex,uid,a_apex,ARRAY[a_apex],m_apex1,'Invoice Feed Integration','Fix recurring sync gaps in the Apex invoice feed and harden the pipeline.','in_progress','high','account',false,
     null,v_email,'Sarah Chen',now()-interval '10 days',
     jsonb_build_array(
       jsonb_build_object('title','Reproduce sync gap','sub_stages','[]'::jsonb,'is_external',false,'completed_at',(now()-interval '6 days'),'assignee_email',v_email,'blocked_reason',null,'external_contact_id',null,'external_contact_name',null),
       jsonb_build_object('title','Identify root cause','sub_stages','[]'::jsonb,'is_external',false,'completed_at',(now()-interval '2 days'),'assignee_email',v_email,'blocked_reason',null,'external_contact_id',null,'external_contact_name',null),
       jsonb_build_object('title','Patch feed handler','sub_stages','[]'::jsonb,'is_external',false,'completed_at',null,'assignee_email',v_email,'blocked_reason',null,'external_contact_id',null,'external_contact_name',null),
       jsonb_build_object('title','Verify with Apex','sub_stages','[]'::jsonb,'is_external',true,'completed_at',null,'assignee_email',null,'blocked_reason',null,'external_contact_id',null,'external_contact_name','Sarah Chen')
     ),v_schema,v_cols,'Top priority for Apex. Root cause found; patching now.',25,(now()-interval '8 days')::date,(now()+interval '20 days')::date,(now()+interval '17 days')::date,
     jsonb_build_array(jsonb_build_object('at',(now()-interval '6 days'),'text','Reproduced the sync gap in staging.'),jsonb_build_object('at',(now()-interval '2 days'),'text','Root cause isolated to the feed handler retry logic.')),now()-interval '8 days',now()-interval '2 days'),

    (p_apex_done,uid,a_apex,ARRAY[a_apex],null,'Q2 Catalog Refresh','Refresh the Apex catalog for Q2 and validate pricing.','complete','medium','account',false,
     null,v_email,'Sarah Chen',now()-interval '70 days',
     jsonb_build_array(
       jsonb_build_object('title','Pull Q2 catalog','sub_stages','[]'::jsonb,'is_external',false,'completed_at',(now()-interval '20 days'),'assignee_email',v_email,'blocked_reason',null,'external_contact_id',null,'external_contact_name',null),
       jsonb_build_object('title','Validate pricing','sub_stages','[]'::jsonb,'is_external',false,'completed_at',(now()-interval '6 days'),'assignee_email',v_email,'blocked_reason',null,'external_contact_id',null,'external_contact_name',null),
       jsonb_build_object('title','Publish to Apex','sub_stages','[]'::jsonb,'is_external',false,'completed_at',(now()-interval '4 days'),'assignee_email',v_email,'blocked_reason',null,'external_contact_id',null,'external_contact_name',null)
     ),v_schema,v_cols,'Shipped on time — recent win.',60,(now()-interval '64 days')::date,(now()-interval '5 days')::date,(now()-interval '4 days')::date,
     jsonb_build_array(jsonb_build_object('at',(now()-interval '4 days'),'text','Catalog published and confirmed by Apex.')),now()-interval '70 days',now()-interval '4 days'),

    (p_summit,uid,a_summit,ARRAY[a_summit,a_summit_dt,a_summit_ws],m_summit,'Shop List Catalog Audit','Audit all Summit shop locations and prep them for shared catalog connection.','planned','medium','account',false,
     null,v_email,'Jennifer Walsh',now()-interval '5 days',
     jsonb_build_array(
       jsonb_build_object('title','Receive full shop list','sub_stages','[]'::jsonb,'is_external',true,'completed_at',null,'assignee_email',null,'blocked_reason',null,'external_contact_id',null,'external_contact_name','Jennifer Walsh'),
       jsonb_build_object('title','Run fuzzy match','sub_stages','[]'::jsonb,'is_external',false,'completed_at',null,'assignee_email',v_email,'blocked_reason',null,'external_contact_id',null,'external_contact_name',null),
       jsonb_build_object('title','Connect Downtown','sub_stages','[]'::jsonb,'is_external',false,'completed_at',null,'assignee_email',v_email,'blocked_reason',null,'external_contact_id',null,'external_contact_name',null)
     ),v_schema,v_cols,'Kicks off once Jennifer sends the shop list.',45,(now()+interval '2 days')::date,(now()+interval '40 days')::date,(now()+interval '47 days')::date,
     jsonb_build_array(jsonb_build_object('at',(now()-interval '5 days'),'text','Kickoff complete; awaiting shop list.')),now()-interval '5 days',now()-interval '5 days'),

    (p_north,uid,a_northwind,ARRAY[a_northwind],m_north,'Renewal Package Prep','Assemble the Northwind renewal package: expanded co-marketing + reporting.','in_progress','medium','account',false,
     null,v_email,'David Park',now()-interval '20 days',
     jsonb_build_array(
       jsonb_build_object('title','Draft co-marketing scope','sub_stages','[]'::jsonb,'is_external',false,'completed_at',(now()-interval '3 days'),'assignee_email',v_email,'blocked_reason',null,'external_contact_id',null,'external_contact_name',null),
       jsonb_build_object('title','Build reporting mockup','sub_stages','[]'::jsonb,'is_external',false,'completed_at',null,'assignee_email',v_email,'blocked_reason',null,'external_contact_id',null,'external_contact_name',null),
       jsonb_build_object('title','Send to David','sub_stages','[]'::jsonb,'is_external',true,'completed_at',null,'assignee_email',null,'blocked_reason',null,'external_contact_id',null,'external_contact_name','David Park')
     ),v_schema,v_cols,'Renewal lands in ~2 weeks. Package must go out this week.',12,(now()-interval '6 days')::date,(now()+interval '12 days')::date,(now()+interval '6 days')::date,
     jsonb_build_array(jsonb_build_object('at',(now()-interval '3 days'),'text','Co-marketing scope drafted.')),now()-interval '20 days',now()-interval '3 days'),

    (p_liberty,uid,a_liberty,ARRAY[a_liberty],null,'Expanded Parts Feed','Stand up the expanded reman parts feed from Liberty.','blocked','low','account',false,
     'Waiting on the full reman parts list from Liberty.',v_email,'Luca Duca',now()-interval '14 days',
     jsonb_build_array(
       jsonb_build_object('title','Request parts list','sub_stages','[]'::jsonb,'is_external',true,'completed_at',(now()-interval '12 days'),'assignee_email',null,'blocked_reason',null,'external_contact_id',null,'external_contact_name','Liberty'),
       jsonb_build_object('title','Map feed schema','sub_stages','[]'::jsonb,'is_external',false,'completed_at',null,'assignee_email',v_email,'blocked_reason','Waiting on the full reman parts list from Liberty.','external_contact_id',null,'external_contact_name',null)
     ),v_schema,v_cols,'Blocked until Liberty sends the parts list.',30,(now()-interval '12 days')::date,(now()+interval '30 days')::date,(now()+interval '35 days')::date,
     jsonb_build_array(jsonb_build_object('at',(now()-interval '12 days'),'text','Requested parts list; awaiting response.')),now()-interval '14 days',now()-interval '12 days'),

    (p_pacific,uid,a_pacific,ARRAY[a_pacific],null,'Full Catalog Connect','Connect all three Pacific shops to the shared catalog.','on_hold','medium','account',false,
     null,v_email,'Luca Duca',now()-interval '30 days',
     jsonb_build_array(
       jsonb_build_object('title','Scope three shops','sub_stages','[]'::jsonb,'is_external',false,'completed_at',(now()-interval '25 days'),'assignee_email',v_email,'blocked_reason',null,'external_contact_id',null,'external_contact_name',null),
       jsonb_build_object('title','Await internal decision','sub_stages','[]'::jsonb,'is_external',true,'completed_at',null,'assignee_email',null,'blocked_reason',null,'external_contact_id',null,'external_contact_name','Pacific Motors')
     ),v_schema,v_cols,'On hold pending Pacific''s internal go-ahead.',50,(now()-interval '28 days')::date,(now()+interval '60 days')::date,(now()+interval '65 days')::date,
     jsonb_build_array(jsonb_build_object('at',(now()-interval '25 days'),'text','Scoped all three shops; paused for their decision.')),now()-interval '30 days',now()-interval '25 days'),

    (p_draft,uid,a_cascade,ARRAY[a_cascade],null,'Invoice Accuracy Initiative','Draft plan to eliminate recurring invoice line-item errors for Cascade.','draft','low','account',false,
     null,v_email,'Luca Duca',now()-interval '2 days',
     jsonb_build_array(
       jsonb_build_object('title','Catalog error patterns','sub_stages','[]'::jsonb,'is_external',false,'completed_at',null,'assignee_email',v_email,'blocked_reason',null,'external_contact_id',null,'external_contact_name',null)
     ),v_schema,v_cols,'Early draft — not yet published.',20,null,(now()+interval '30 days')::date,null,
     '[]'::jsonb,now()-interval '2 days',now()-interval '2 days'),

    (p_board,uid,a_product,ARRAY[a_product],null,'Team Intake Board','Standing board for the product team''s incoming work.','in_progress','medium','org',true,
     null,v_email,'Priya Nair',now()-interval '120 days',
     '[]'::jsonb,v_schema,v_cols,'Standing intake board for the product team.',null,(now()-interval '120 days')::date,null,null,
     jsonb_build_array(jsonb_build_object('at',(now()-interval '7 days'),'text','Weekly triage done.')),now()-interval '120 days',now()-interval '3 days');

  -- ── TASKS — open / overdue / done / commitments / standing-board ──────
  insert into folio_tasks
    (id,user_id,account_id,project_id,parent_step_index,title,description,status,task_status,done,closed_at,
     assignee_email,recipient,due_date,is_commitment,user_added,custom_fields,task_notes,source_meeting_id,
     pip_created_at,cadence_id,created_at,updated_at)
  values
    (gen_random_uuid(),uid,a_apex,null,null,'Send Q3 pricing proposal to Sarah','Promised on the biweekly. Budget already approved.','planned','intake',false,null,
     v_email,'Sarah Chen',(now()+interval '3 days')::date,true,false,'{"priority":"High","description":"Q3 pricing proposal for approved catalog lines."}'::jsonb,
     jsonb_build_array(jsonb_build_object('at',(now()-interval '10 days'),'note','Captured from the Apex biweekly.')),m_apex1,now()-interval '10 days',cad_apex,now()-interval '10 days',now()-interval '10 days'),

    (gen_random_uuid(),uid,a_apex,p_apex,2,'Patch invoice feed handler','Root cause found; patch the feed handler and verify.','in_progress','in_progress',false,null,
     v_email,null,(now()-interval '3 days')::date,false,false,'{"priority":"High","description":"Patch the retry logic in the feed handler."}'::jsonb,
     jsonb_build_array(jsonb_build_object('at',(now()-interval '2 days'),'note','Root cause isolated.')),m_apex1,now()-interval '8 days',null,now()-interval '8 days',now()-interval '2 days'),

    (gen_random_uuid(),uid,a_summit,p_summit,2,'Schedule Summit shop walkthrough','Coordinate with Jennifer; Downtown first.','planned','intake',false,null,
     v_email,'Jennifer Walsh',(now()+interval '7 days')::date,true,false,'{"priority":"Medium"}'::jsonb,
     null,m_summit,now()-interval '5 days',cad_summit,now()-interval '5 days',now()-interval '5 days'),

    (gen_random_uuid(),uid,a_granite,null,null,'Re-engage Granite — quiet 50+ days','Tom has gone dark. Reach out before it becomes a renewal problem.','planned','intake',false,null,
     v_email,'Tom Reed',(now()+interval '2 days')::date,false,true,'{"priority":"High"}'::jsonb,
     jsonb_build_array(jsonb_build_object('at',(now()-interval '6 days'),'note','Flagged during portfolio review.')),null,null,null,now()-interval '6 days',now()-interval '6 days'),

    (gen_random_uuid(),uid,a_cascade,null,null,'Send May catalog update to Cascade','Monthly catalog refresh.','complete','done',true,now()-interval '12 days',
     v_email,'Mike Torres',(now()-interval '12 days')::date,false,false,'{"priority":"Low"}'::jsonb,
     null,null,null,cad_cascade,now()-interval '20 days',now()-interval '12 days'),

    (gen_random_uuid(),uid,a_northwind,p_north,1,'Review agreement renewal terms','Confirm reporting + co-marketing scope before sending package.','planned','intake',false,null,
     v_email,'David Park',(now()+interval '10 days')::date,true,false,'{"priority":"Medium","description":"Confirm scope before sending the renewal package."}'::jsonb,
     null,m_north,now()-interval '20 days',null,now()-interval '20 days',now()-interval '20 days'),

    (gen_random_uuid(),uid,a_product,null,null,'Draft Q3 roadmap one-pager','For the team standup and Priya 1:1.','planned','intake',false,null,
     v_email,'Priya Nair',(now()+interval '5 days')::date,false,true,'{"priority":"Medium"}'::jsonb,
     null,null,null,cad_product,now()-interval '3 days',now()-interval '3 days'),

    (gen_random_uuid(),uid,a_liberty,null,null,'Scope expanded parts feed with Liberty','Explore the reman parts feed expansion.','blocked','intake',false,null,
     v_email,'Liberty',null,false,true,'{"priority":"Low"}'::jsonb,
     null,null,null,null,now()-interval '14 days',now()-interval '14 days'),

    (gen_random_uuid(),uid,a_product,p_board,null,'Review AM enablement deck','Incoming request — review and route.','planned','intake',false,null,
     v_email,null,(now()+interval '6 days')::date,false,true,'{"priority":"Medium","description":"Review the AM enablement deck and give notes."}'::jsonb,
     null,null,null,null,now()-interval '4 days',now()-interval '4 days'),

    (gen_random_uuid(),uid,a_product,p_board,null,'Build integration tooling spec','Spec the next integration tooling milestone.','in_progress','in_progress',false,null,
     'priya.nair@folioshq.com',null,(now()+interval '12 days')::date,false,true,'{"priority":"High","description":"Spec the tooling milestone for Q3."}'::jsonb,
     jsonb_build_array(jsonb_build_object('at',(now()-interval '2 days'),'note','Priya owns this.')),null,null,null,now()-interval '9 days',now()-interval '2 days'),

    (gen_random_uuid(),uid,a_product,p_board,null,'Publish Q2 retro notes','Wrap up and publish the Q2 retro.','complete','done',true,now()-interval '5 days',
     v_email,'Team',(now()-interval '6 days')::date,false,true,'{"priority":"Low"}'::jsonb,
     null,null,null,null,now()-interval '20 days',now()-interval '5 days');

  raise notice 'Sandbox seeded (max coverage) for % (uid %).', v_email, uid;
end $$;
