-- Wave 3 source registry seed.
-- Run with service_role / postgres (bypasses RLS). Safe to re-run (upsert by name+experience).

insert into sources (
  name,
  experience,
  adapter_type,
  feed_url,
  active,
  default_category_overdrive,
  default_category_event_discovery
)
values
  (
    'City of Ventura — Parks & Recreation Events',
    'event_discovery',
    'ics',
    'https://www.cityofventura.ca.gov/common/modules/iCalendar/iCalendar.aspx?catID=44&feed=calendar',
    true,
    null,
    'community'
  ),
  (
    'City of Moorpark — Community Events',
    'event_discovery',
    'ics',
    'https://www.moorparkca.gov/common/modules/iCalendar/iCalendar.aspx?catID=32&feed=calendar',
    true,
    null,
    'community'
  ),
  (
    -- TODO: Simi Valley Granicus "Community Events" RSS URL must be copied from the
    -- browser UI (feed link is not exposed as a static href). Leave inactive until set.
    'City of Simi Valley — Community Events',
    'event_discovery',
    'rss',
    null,
    false,
    null,
    'community'
  ),
  (
    'Thousand Oaks Library — Events Calendar',
    'event_discovery',
    'ics',
    'https://libcal.tolibrary.org/ical_subscribe.php?src=p&cid=11570',
    true,
    null,
    'educational'
  ),
  (
    'City of Beverly Hills — City Events and Activities',
    'event_discovery',
    'ics',
    'https://www.beverlyhills.gov/common/modules/iCalendar/iCalendar.aspx?catID=14&feed=calendar',
    true,
    null,
    'community'
  ),
  (
    'Beverly Hills Public Library — Events and Activities',
    'event_discovery',
    'ics',
    'https://www.beverlyhills.gov/common/modules/iCalendar/iCalendar.aspx?catID=25&feed=calendar',
    true,
    null,
    'educational'
  ),
  (
    -- CivicPlus iCalendar directory is empty for Anaheim; use calendar RSS module feed.
    'City of Anaheim — Calendar',
    'event_discovery',
    'rss',
    'https://www.anaheim.net/RSSFeed.aspx?ModID=58&CID=All-calendar.xml',
    true,
    null,
    'community'
  ),
  (
    'City of Yorba Linda — Parks & Recreation Events',
    'event_discovery',
    'ics',
    'https://www.yorbalindaca.gov/common/modules/iCalendar/iCalendar.aspx?catID=24&feed=calendar',
    true,
    null,
    'outdoor'
  ),
  (
    'PCA-LA (Porsche Club of America — Los Angeles)',
    'overdrive',
    'ics',
    'https://calendar.google.com/calendar/ical/c_8a6e532f323fc83dad2a359cd03723137f80e04ca058316adefd360f9204f94e%40group.calendar.google.com/public/basic.ics',
    true,
    'other',
    null
  ),
  (
    'City of Fillmore — Community Events',
    'event_discovery',
    'ics',
    'https://www.fillmoreca.gov/common/modules/iCalendar/iCalendar.aspx?catID=25&feed=calendar',
    true,
    null,
    'community'
  ),
  (
    'City of Ojai — Events',
    'event_discovery',
    'ics',
    'https://www.ojai.ca.gov/common/modules/iCalendar/iCalendar.aspx?catID=14&feed=calendar',
    true,
    null,
    'community'
  ),
  (
    'City of Port Hueneme — Recreation & Community Services',
    'event_discovery',
    'ics',
    'https://www.ci.port-hueneme.ca.us/common/modules/iCalendar/iCalendar.aspx?catID=24&feed=calendar',
    true,
    null,
    'community'
  ),
  (
    'City of Santa Paula — Calendar',
    'event_discovery',
    'ics',
    'https://www.spcity.org/common/modules/iCalendar/iCalendar.aspx?catID=26&feed=calendar',
    true,
    null,
    'community'
  ),
  (
    -- LibCal/Springshare library subdomain only — do NOT use cityofcamarillo.org
    -- (robots.txt disallows automated access to the main city site).
    'Camarillo Public Library — Events Calendar',
    'event_discovery',
    'ics',
    'https://camarillolibrary.libcal.com/ical_subscribe.php?src=p&cid=11325',
    true,
    null,
    'educational'
  ),

  -- ===========================================================================
  -- San Diego County + Los Angeles County expansion
  -- ===========================================================================
  -- Not yet confirmed — candidates for future research (do NOT register as sources):
  -- San Diego County: Chula Vista, Oceanside, Solana Beach, City of San Diego
  --   (proper), Santee (not fully checked)
  -- Los Angeles County: Pasadena, Burbank (mixed platform signals), Santa Monica,
  --   Long Beach (Trumba — feed unconfirmed), Redondo Beach, El Segundo
  -- Also excluded (prior decisions): City of Camarillo main city site (robots.txt),
  --   City of Oxnard (no usable feed).
  --
  -- Attempted but NO working feed URL confirmed (do NOT seed until verified live):
  -- SD: Carlsbad city (Akamai 403), Carlsbad City Library (Akamai 403 on feed
  --   paths), Lemon Grove (events.lemongrove.ca.gov Subscribe UI present but
  --   format=rss|ical returns HTML only), Vista, El Cajon, National City,
  --   Encinitas (Akamai 403)
  -- LA: Calabasas, Agoura Hills (Akamai 403 on calendar/export paths), Santa
  --   Clarita Localist (calendar HTML loads; ICS/RSS export URLs 404/406/429),
  --   Glendale, Culver City, Torrance, Manhattan Beach, Hermosa Beach, Pomona,
  --   Claremont (Akamai 403)
  -- Note: Beverly Hills already registered via beverlyhills.gov (same CivicEngage
  --   iCalendar feeds as beverlyhills.org) — not duplicated below.

  (
    'City of Escondido — City Events',
    'event_discovery',
    'ics',
    'https://www.escondido.gov/common/modules/iCalendar/iCalendar.aspx?catID=14&feed=calendar',
    true,
    null,
    'community'
  ),
  (
    'City of Poway — Community Events',
    'event_discovery',
    'ics',
    'https://www.poway.org/common/modules/iCalendar/iCalendar.aspx?catID=22&feed=calendar',
    true,
    null,
    'community'
  ),
  (
    'City of Coronado — Main Calendar',
    'event_discovery',
    'ics',
    'https://www.coronado.ca.us/common/modules/iCalendar/iCalendar.aspx?catID=14&feed=calendar',
    true,
    null,
    'community'
  ),
  (
    'City of Del Mar — Community Calendar',
    'event_discovery',
    'ics',
    'https://www.delmar.ca.us/common/modules/iCalendar/iCalendar.aspx?catID=24&feed=calendar',
    true,
    null,
    'community'
  ),
  (
    'City of Imperial Beach — Events Calendar',
    'event_discovery',
    'ics',
    'https://www.imperialbeachca.gov/common/modules/iCalendar/iCalendar.aspx?catID=14&feed=calendar',
    true,
    null,
    'community'
  ),
  (
    'City of La Mesa — Community Events',
    'event_discovery',
    'ics',
    'https://www.cityoflamesa.gov/common/modules/iCalendar/iCalendar.aspx?catID=34&feed=calendar',
    true,
    null,
    'community'
  ),
  (
    'City of Westlake Village — Special Events',
    'event_discovery',
    'ics',
    'https://www.wlv.org/common/modules/iCalendar/iCalendar.aspx?catID=28&feed=calendar',
    true,
    null,
    'community'
  ),
  (
    'City of Malibu — Special Events',
    'event_discovery',
    'ics',
    'https://www.malibucity.org/common/modules/iCalendar/iCalendar.aspx?catID=43&feed=calendar',
    true,
    null,
    'community'
  ),
  (
    'Simi Valley Public Library — Events',
    'event_discovery',
    'librarycalendar',
    'https://simivalley.librarycalendar.com',
    true,
    null,
    'educational'
  )
on conflict (name, experience) do update set
  adapter_type = excluded.adapter_type,
  feed_url = excluded.feed_url,
  active = excluded.active,
  default_category_overdrive = excluded.default_category_overdrive,
  default_category_event_discovery = excluded.default_category_event_discovery,
  updated_at = now();

-- Locality hint + canonical facility address for LibCal room/venue nicknames.
-- Room names stay on events; override is the Mapbox geocode target only.
update sources
set geocode_context = 'Camarillo, CA',
    geocode_override = '4101 Las Posas Road, Camarillo, CA 93010',
    updated_at = now()
where name = 'Camarillo Public Library — Events Calendar'
  and experience = 'event_discovery';

-- Multi-campus LibCal: facility map beats source-level geocode_override when matched.
update sources
set geocode_context = 'Thousand Oaks, CA',
    geocode_override = '1401 E Janss Road, Thousand Oaks, CA 91362',
    location_overrides = $json$[
      {"match": "newbury park library", "address": "2331 Borchard Road, Newbury Park, CA 91320", "latitude": 34.18492, "longitude": -118.91405},
      {"match": "goebel", "address": "1385 E Janss Road, Thousand Oaks, CA 91362", "latitude": 34.20085, "longitude": -118.85195},
      {"match": "grant r. brimhall", "address": "1401 E Janss Road, Thousand Oaks, CA 91362", "latitude": 34.201162, "longitude": -118.852605},
      {"match": "brimhall library", "address": "1401 E Janss Road, Thousand Oaks, CA 91362", "latitude": 34.201162, "longitude": -118.852605}
    ]$json$::jsonb,
    updated_at = now()
where name = 'Thousand Oaks Library — Events Calendar'
  and experience = 'event_discovery';

-- Simi library: pin library-named venues; offsite programs geocode via address+context.
update sources
set geocode_context = 'Simi Valley, CA',
    geocode_override = null,
    location_overrides = $json$[
      {"match": "simi valley public library", "address": "2969 Tapo Canyon Rd, Simi Valley, CA 93063", "latitude": 34.288922, "longitude": -118.719389}
    ]$json$::jsonb,
    updated_at = now()
where name = 'Simi Valley Public Library — Events'
  and experience = 'event_discovery';

-- M2: only Poway is trusted for controlled auto-publication. All others stay probation.
update sources
set publication_policy = 'probation',
    updated_at = now()
where experience = 'event_discovery';

update sources
set publication_policy = 'trusted',
    updated_at = now()
where name = 'City of Poway — Community Events'
  and experience = 'event_discovery';
