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
    'City of Port Hueneme — Main City Calendar',
    'event_discovery',
    'ics',
    'https://www.ci.port-hueneme.ca.us/common/modules/iCalendar/iCalendar.aspx?catID=14&feed=calendar',
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
    'City of Westlake Village — Main Calendar',
    'event_discovery',
    'ics',
    'https://www.wlv.org/common/modules/iCalendar/iCalendar.aspx?catID=14&feed=calendar',
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
  )
on conflict (name, experience) do update set
  adapter_type = excluded.adapter_type,
  feed_url = excluded.feed_url,
  active = excluded.active,
  default_category_overdrive = excluded.default_category_overdrive,
  default_category_event_discovery = excluded.default_category_event_discovery,
  updated_at = now();
