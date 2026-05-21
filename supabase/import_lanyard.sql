-- ============================================================
-- Lanyard → Folio Import
-- Run once in Supabase SQL Editor after schema.sql
-- ============================================================

-- Add Pip output columns to folio_meetings
alter table folio_meetings add column if not exists pip_summary text;
alter table folio_meetings add column if not exists pip_email   text;

-- ============================================================
-- Accounts (all Lanyard partners)
-- ============================================================

insert into folio_accounts (user_id, name, tier, status) values
  ('e5848962-3968-479d-b38e-0540807d54b3', '1-800 Radiator',    'Growth', 'yellow'),
  ('e5848962-3968-479d-b38e-0540807d54b3', 'All Star Auto Parts','Major',  'green'),
  ('e5848962-3968-479d-b38e-0540807d54b3', 'Collision Auto Parts','Growth','green'),
  ('e5848962-3968-479d-b38e-0540807d54b3', 'Empire Auto Parts',  'Major',  'green'),
  ('e5848962-3968-479d-b38e-0540807d54b3', 'KSI',                'Major',  'yellow'),
  ('e5848962-3968-479d-b38e-0540807d54b3', 'LKQ',                'Major',  'yellow'),
  ('e5848962-3968-479d-b38e-0540807d54b3', 'Pacific Best',       'Growth', 'green'),
  ('e5848962-3968-479d-b38e-0540807d54b3', 'Parts Authority',    'Mid',    'green'),
  ('e5848962-3968-479d-b38e-0540807d54b3', 'UCC',                'Mid',    'green'),
  ('e5848962-3968-479d-b38e-0540807d54b3', 'XL Parts',           'Mid',    'green'),
  ('e5848962-3968-479d-b38e-0540807d54b3', 'The Parts House',    'Mid',    'green');

-- ============================================================
-- Meetings — ABPA 2026 conference notes
-- ============================================================

-- 1-800 Radiator
insert into folio_meetings
  (account_id, user_id, title, meeting_date, notes, action_items, commitments, rating, pip_summary, pip_email)
values (
  (select id from folio_accounts where user_id = 'e5848962-3968-479d-b38e-0540807d54b3' and name = '1-800 Radiator'),
  'e5848962-3968-479d-b38e-0540807d54b3',
  'ABPA 2026',
  '2026-05-20',
  $$Franchise owners don't understand the value of being on Trax — education gap at the ownership level
1-800 wants to build a platform handbook and needs documentation from us to include
Opportunity to present at their regional conferences directly to franchise owners
Concern raised about parts tech charging for too many features
Integration value needs to be communicated better to owners
Order response report needed for Lindsay — will help 1-800 decide on enabling manual orders for Caliber
Requested integrated vs non-integrated order breakdown by location
Wants updated integration breakdown reflecting the 1,600 new integrations
Interested in warehouse pop-ups for reminders (chats, alerts, etc.)$$,
  $$Discuss options for improving integration
Send order response report
Send a no response report — confirm if "pending" is the right order status$$,
  'Send order response time report.',
  4,
  $$Strong strategic meeting. 1-800 is building a handbook for platform education and wants documentation they can share with franchise owners to close the Trax knowledge gap. Key opportunity to get in front of owners at their regional conferences. Main technical ask is the order response report to help them decide on turning on manual orders for Caliber.$$,
  $$Hi [Name],

Great connecting at ABPA. A few things I'm moving on from our conversation:

I'll get you the order response report for Lindsay so you can make the call on manual orders for Caliber. I'll also pull together an updated integration breakdown reflecting our recent 1,600 new integrations and a location-level split of integrated vs non-integrated orders.

On the handbook — send me a list of what you're looking to cover and I'll put together documentation you can use with your franchise owners. I think getting in front of them at a regional conference is the right move and I'd love to make that happen.

More soon,
Chris$$
);

-- UCC
insert into folio_meetings
  (account_id, user_id, title, meeting_date, notes, action_items, pip_summary, pip_email)
values (
  (select id from folio_accounts where user_id = 'e5848962-3968-479d-b38e-0540807d54b3' and name = 'UCC'),
  'e5848962-3968-479d-b38e-0540807d54b3',
  'ABPA 2026',
  '2026-05-20',
  $$Strong lift in Alabama since Mississippi merge, driven by MSOs
UCC wants to grow Gerber Collision spend — asking how to gain a business rule
Directed them to work with the MSO on agreements and strategy
Classic Collision business rule exists — do not disclose in writing
Requested full shop list for audits — confirm if it was sent
Asked about supplier preference list breakdown (priority 1/2/3) per shop
Needs non-transacting shop list
Integration conflict: UCC is on OneSource, COL appears to be on Fuse5 — needs research$$,
  $$Confirm whether full shop list for audits was sent
Research integration conflict between OneSource and Fuse5
Send non-transacting shop list
Provide supplier preference list breakdown per shop (priority 1/2/3)$$,
  $$Positive momentum in Alabama following the Mississippi merge, primarily in MSOs. UCC is pushing to capture more Gerber spend and asking for business rules to formalize the relationship. Key technical issue is an integration conflict — UCC is on OneSource but COL appears to be on Fuse5, which needs to be untangled.$$,
  $$Hi [Name],

Good seeing you at ABPA. Following up on a few things from our conversation:

I'm going to dig into the integration conflict between OneSource and Fuse5 and get you clarity on what's connected where. I'll also send over the non-transacting shop list.

On the Gerber side — the best path to growing that spend is through the MSO agreement and strategy conversation. Let's keep that moving and I'll support where I can.

Can you confirm whether the full shop list for audits was sent? Want to make sure we're working off the same data.

Talk soon,
Chris$$
);

-- Collision Auto Parts
insert into folio_meetings
  (account_id, user_id, title, meeting_date, notes, action_items, pip_summary, pip_email)
values (
  (select id from folio_accounts where user_id = 'e5848962-3968-479d-b38e-0540807d54b3' and name = 'Collision Auto Parts'),
  'e5848962-3968-479d-b38e-0540807d54b3',
  'ABPA 2026',
  '2026-05-20',
  $$CCC crash course data: 23.7% total loss rate
Wants part type split averages — OE, salvage, reman, aftermarket certified vs non-certified
Wants to compare their normal metrics against market data
Merging 3 integrations into 1 after summer/fall — set up scoping call with Gordon
Asked about fuel surcharge toggle on invoices — wants it visible to customers, on/off capability
Ship2 program covers 80% of California zip codes — wants to display parts by region and hide from others — broadly applicable feature
Bundled part pricing at a discount — another broadly applicable feature opportunity
Confirmed direct integration$$,
  $$Set up call with Gordon to scope merging 3 integrations into 1
Research fuel surcharge toggle capability
Research regional part display by zip code
Research bundled part pricing capability$$,
  $$High-engagement meeting with a lot of product and strategic asks. COL is merging three integrations into one after summer and wants clean data comparisons, part type splits, and fuel surcharge display. Two standout opportunities: regional part visibility by zip and bundled part pricing — both have broad applicability across other suppliers.$$,
  $$Hi [Name],

Really valuable conversation at ABPA — a lot to move on here.

I'm setting up time with Gordon to scope out the integration consolidation. On the data side, I'll pull together the part type split you asked about — OE vs salvage vs reman vs aftermarket certified/non-certified — and work on a market comparison view.

The fuel surcharge toggle and regional part display are both on my radar. The zip-based visibility idea is something that could benefit a lot of accounts so I want to make sure we think through it properly.

More to come on all of this. Let's set up a follow-up call after you've had a chance to settle post-conference.

Chris$$
);

-- KSI
insert into folio_meetings
  (account_id, user_id, title, meeting_date, notes, action_items, pip_summary, pip_email)
values (
  (select id from folio_accounts where user_id = 'e5848962-3968-479d-b38e-0540807d54b3' and name = 'KSI'),
  'e5848962-3968-479d-b38e-0540807d54b3',
  'ABPA 2026',
  '2026-05-20',
  $$Continental (a KSI brand) migrating Ohio and Western PA accounts to KSI Auto — 30 day timeline
CAPA certification flagged as an issue but confirmed it is not — clarify internally so it doesn't resurface
Check MSO adoption rate of BackTrax across KSI accounts$$,
  $$Check MSO BackTrax adoption rate across KSI accounts
Coordinate Continental migration to KSI Auto for Ohio and Western PA
Clarify CAPA certification status internally$$,
  $$Operational update meeting. Continental (a KSI brand) is migrating Ohio and Western PA accounts to KSI Auto within 30 days. The CAPA certification issue that was flagged is not actually a problem — needs to be communicated clearly to avoid confusion. MSO BackTrax adoption also needs a check.$$,
  $$Hi [Name],

Following up from ABPA — a few things on my end:

I'll check in on MSO BackTrax adoption and get you a current picture. On the CAPA question, we're aligned that it's not an issue — I just want to make sure that's clearly communicated so it doesn't keep coming up.

On the Continental migration — let's make sure the Ohio and Western PA transition to KSI Auto goes smoothly on our end. I'll coordinate on my side and flag anything that needs attention.

Talk soon,
Chris$$
);

-- LKQ
insert into folio_meetings
  (account_id, user_id, title, meeting_date, notes, pip_summary, pip_email)
values (
  (select id from folio_accounts where user_id = 'e5848962-3968-479d-b38e-0540807d54b3' and name = 'LKQ'),
  'e5848962-3968-479d-b38e-0540807d54b3',
  'ABPA 2026',
  '2026-05-20',
  $$Gerber confirmed full shop rollout with LKQ salvage — significant win
LKQ internally concerned about Gerber dependency given heavy sales increase since Gerber moved away from centralized procurement
Monitor relationship dynamics as rollout scales$$,
  $$Big win — Gerber confirmed they want to roll out LKQ salvage across all their shops. LKQ has some internal concern given how much Gerber spend has grown since moving away from centralized procurement, but this is a major opportunity for both sides.$$,
  $$Hi [Name],

Quick note following our ABPA conversation — really excited about the Gerber rollout. That's a big deal for both of us and I want to make sure we execute it well.

Let's get a plan together for timing and logistics. I'll follow your lead on how you want to handle the rollout pace given where things stand internally.

Looking forward to getting this moving.

Chris$$
);

-- Parts Authority
insert into folio_meetings
  (account_id, user_id, title, meeting_date, notes, action_items, pip_summary, pip_email)
values (
  (select id from folio_accounts where user_id = 'e5848962-3968-479d-b38e-0540807d54b3' and name = 'Parts Authority'),
  'e5848962-3968-479d-b38e-0540807d54b3',
  'ABPA 2026',
  '2026-05-20',
  $$Focus on New York market expansion
Interested in accounts API to automate connection and integration — needs research
PA wants to go national with MSOs only to expand product offerings — wants to test it
Will work with Dan on the national MSO strategy
Functionality needed: display national SKUs that can be shipped to a region
Working with Gordon on that capability
Discussed attending next regional rollout to present
Send connection statuses$$,
  $$Research accounts connection API for automating connect/integrate flow
Send current connection statuses
Work with Dan on national MSO strategy plan
Work with Gordon on regional SKU display capability
Attend next regional rollout$$,
  $$Growth-focused meeting centered on NY expansion and going national with MSOs. Parts Authority wants to test a national MSO strategy with expanded product offerings and is interested in an accounts API to automate connecting and integrating. Regional SKU display for national shipping is the key technical ask.$$,
  $$Hi [Name],

Great conversation at ABPA. Here's where I'm at on the follow-ups:

I'm researching the accounts connection API and will send you an update on what's possible for automating the connect/integrate flow. I'll also pull together your current connection statuses.

On the national MSO strategy — I'm looped in with Dan and we'll put together a plan to test the expanded product offering. The regional SKU display is something I'm working through with Gordon and I'll keep you posted.

I'd love to be at your next regional rollout — let's make that happen.

Chris$$
);

-- All Star Auto Parts
insert into folio_meetings
  (account_id, user_id, title, meeting_date, notes, action_items, pip_summary, pip_email)
values (
  (select id from folio_accounts where user_id = 'e5848962-3968-479d-b38e-0540807d54b3' and name = 'All Star Auto Parts'),
  'e5848962-3968-479d-b38e-0540807d54b3',
  'ABPA 2026',
  '2026-05-20',
  $$Classic Collision rollout through All Star targeted for next month
Audit current Classic Collision account list before launch
Work with Adam on connect/disconnect strategy and timing$$,
  $$Audit current Classic Collision account list
Work with Adam on connect/disconnect game plan
Confirm rollout timeline for next month$$,
  $$All Star is ready to roll out Classic Collision beginning of next month. Focus is on auditing their current account list and working with Adam to build a clean connect/disconnect game plan before launch.$$,
  $$Hi [Name],

Great catching up at ABPA. Excited to get the Classic Collision rollout moving through All Star — targeting next month.

I'll start on the account list audit this week and loop in Adam to map out the connect/disconnect plan. I'll keep you posted as we get closer to launch.

Chris$$
);

-- XL Parts (joint meeting with The Parts House)
insert into folio_meetings
  (account_id, user_id, title, meeting_date, notes, action_items, follow_up_date, pip_summary, pip_email)
values (
  (select id from folio_accounts where user_id = 'e5848962-3968-479d-b38e-0540807d54b3' and name = 'XL Parts'),
  'e5848962-3968-479d-b38e-0540807d54b3',
  'ABPA 2026',
  '2026-05-20',
  $$Joint meeting with XL Parts and The Parts House
Will receive XL and TPH accounts list — run fuzzy match
Research displaying their OE products as opt OE in the platform
Alliance Auto acquired — staying as a separate account
Alliance needs its own agreement — initiate that conversation
Integration issues with Alliance need a dedicated call to sort through
Coordinate with Delvis$$,
  $$Receive and fuzzy match XL and TPH accounts list
Research opt OE display for their OE products
Initiate Alliance Auto agreement conversation
Set up dedicated call to sort through Alliance integration
Coordinate with Delvis on follow-up call timing$$,
  '2026-05-29',
  $$Joint meeting covering XL Parts and The Parts House. Key asks are OE product display as opt OE, an accounts list for fuzzy matching, and sorting out Alliance Auto's integration following their acquisition. Alliance will remain a separate account and needs its own agreement. Follow-up call confirmed for next Friday with Delvis coordinating.$$,
  $$Hi [Name],

Really good conversation at ABPA. Here's what I'm working on:

I'll pull the accounts list once you send it over and run the fuzzy match. I'm also looking into how we can display your OE products — the opt OE designation seems like the right path and I'll confirm what's possible.

On Alliance — I want to make sure we have a proper agreement in place and get the integration sorted. Let's dedicate time on our Friday call to work through that specifically. I'll coordinate with Delvis on timing.

Talk Friday,
Chris$$
);
