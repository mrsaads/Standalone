// Countries, states/provinces and cities the public site has a page for.
//
// URL shape:  /upwork-bidding-agency                       (all countries)
//             /upwork-bidding-agency/<country>             (one country + its cities)
//             /upwork-bidding-agency/<country>/<city>      (one city)
//
// Read this before adding rows. Search engines treat large sets of near-identical pages that differ
// only by a place name as "doorway pages" and can demote the whole site for them. Every page here
// therefore carries things that are genuinely different per place — its region, its time zone, when
// the main client markets start work in local time, and country-level context written by hand. Add a
// city only when it is a real freelancing centre, and keep the `context` paragraphs specific.
// Adding a city means adding its note in city-notes.ts too — without one the page is served but
// marked noindex and left out of the sitemap (scripts/local-tests/marketing-content checks this).
// Coordinates are the city centre, used for the geo meta tags and schema.org GeoCoordinates.

import { cityNote } from "./city-notes";

export type City = {
  slug: string;
  name: string;
  region: string; // state / province / division — shown as "City, Region"
  tz: string; // IANA time zone
  lat: number;
  lng: number;
};

export type Country = {
  slug: string;
  name: string;
  short: string; // how it reads mid-sentence: "the United States", "Pakistan"
  iso: string; // ISO 3166-1 alpha-2
  hreflang: string; // BCP-47 tag for the country (kept for reference; the pages are not language alternates of each other)
  currency: string;
  regionWord: string; // "state" | "province" | "county" …
  // Hand-written. What is actually different about bidding on Upwork from this country.
  context: string[];
  cities: City[];
};

const c = (slug: string, name: string, region: string, tz: string, lat: number, lng: number): City => ({ slug, name, region, tz, lat, lng });

export const COUNTRIES: Country[] = [
  {
    slug: "united-states", name: "United States", short: "the United States", iso: "US", hreflang: "en-US", currency: "US dollar (USD)", regionWord: "state",
    context: [
      "The United States is the largest source of client spend on Upwork, which changes the problem for American freelancers and agencies: you are in your clients' time zone and you are competing with the whole world for their attention. Winning is rarely about price — it is about being the proposal that reads as local, specific and low-risk.",
      "For US-based agencies the constraint is usually hours rather than opportunity. Senior people end up doing the bidding because nobody else can represent the work, and it comes straight out of billable time. A dedicated bidder who works to a written targeting profile gives those hours back without lowering the bar on what gets sent.",
    ],
    cities: [
      c("new-york", "New York", "New York", "America/New_York", 40.7128, -74.006),
      c("los-angeles", "Los Angeles", "California", "America/Los_Angeles", 34.0522, -118.2437),
      c("chicago", "Chicago", "Illinois", "America/Chicago", 41.8781, -87.6298),
      c("houston", "Houston", "Texas", "America/Chicago", 29.7604, -95.3698),
      c("dallas", "Dallas", "Texas", "America/Chicago", 32.7767, -96.797),
      c("austin", "Austin", "Texas", "America/Chicago", 30.2672, -97.7431),
      c("san-francisco", "San Francisco", "California", "America/Los_Angeles", 37.7749, -122.4194),
      c("san-diego", "San Diego", "California", "America/Los_Angeles", 32.7157, -117.1611),
      c("seattle", "Seattle", "Washington", "America/Los_Angeles", 47.6062, -122.3321),
      c("miami", "Miami", "Florida", "America/New_York", 25.7617, -80.1918),
      c("boston", "Boston", "Massachusetts", "America/New_York", 42.3601, -71.0589),
      c("atlanta", "Atlanta", "Georgia", "America/New_York", 33.749, -84.388),
      c("philadelphia", "Philadelphia", "Pennsylvania", "America/New_York", 39.9526, -75.1652),
      c("washington-dc", "Washington, D.C.", "District of Columbia", "America/New_York", 38.9072, -77.0369),
      c("denver", "Denver", "Colorado", "America/Denver", 39.7392, -104.9903),
      c("phoenix", "Phoenix", "Arizona", "America/Phoenix", 33.4484, -112.074),
    ],
  },
  {
    slug: "united-kingdom", name: "United Kingdom", short: "the United Kingdom", iso: "GB", hreflang: "en-GB", currency: "pound sterling (GBP)", regionWord: "nation",
    context: [
      "British freelancers sit in a useful middle position on Upwork: the working day overlaps with European clients in the morning and with the US East Coast in the afternoon. The cost is that the best American jobs are often posted after UK office hours, when a solo freelancer has stopped checking the feed.",
      "UK clients and agencies tend to write detailed briefs and expect a proposal that answers them point by point. A templated opening is noticed immediately. That suits a bidding approach built on reading the brief properly rather than sending volume.",
    ],
    cities: [
      c("london", "London", "England", "Europe/London", 51.5074, -0.1278),
      c("manchester", "Manchester", "England", "Europe/London", 53.4808, -2.2426),
      c("birmingham", "Birmingham", "England", "Europe/London", 52.4862, -1.8904),
      c("leeds", "Leeds", "England", "Europe/London", 53.8008, -1.5491),
      c("liverpool", "Liverpool", "England", "Europe/London", 53.4084, -2.9916),
      c("bristol", "Bristol", "England", "Europe/London", 51.4545, -2.5879),
      c("glasgow", "Glasgow", "Scotland", "Europe/London", 55.8642, -4.2518),
      c("edinburgh", "Edinburgh", "Scotland", "Europe/London", 55.9533, -3.1883),
      c("cardiff", "Cardiff", "Wales", "Europe/London", 51.4816, -3.1791),
      c("belfast", "Belfast", "Northern Ireland", "Europe/London", 54.5973, -5.9301),
    ],
  },
  {
    slug: "canada", name: "Canada", short: "Canada", iso: "CA", hreflang: "en-CA", currency: "Canadian dollar (CAD)", regionWord: "province",
    context: [
      "Canadian freelancers share time zones with the US client base, which removes the timing problem most of the world has — and puts them in direct competition with American freelancers for the same jobs. Clear positioning matters more than speed here.",
      "Canada spans several time zones, so a Vancouver freelancer and a Toronto freelancer see the same job at very different points in their day. A bidder covering the feed from early Eastern to late Pacific closes that gap.",
    ],
    cities: [
      c("toronto", "Toronto", "Ontario", "America/Toronto", 43.6532, -79.3832),
      c("ottawa", "Ottawa", "Ontario", "America/Toronto", 45.4215, -75.6972),
      c("montreal", "Montreal", "Quebec", "America/Toronto", 45.5019, -73.5674),
      c("vancouver", "Vancouver", "British Columbia", "America/Vancouver", 49.2827, -123.1207),
      c("calgary", "Calgary", "Alberta", "America/Edmonton", 51.0447, -114.0719),
      c("edmonton", "Edmonton", "Alberta", "America/Edmonton", 53.5461, -113.4938),
      c("winnipeg", "Winnipeg", "Manitoba", "America/Winnipeg", 49.8951, -97.1384),
    ],
  },
  {
    slug: "australia", name: "Australia", short: "Australia", iso: "AU", hreflang: "en-AU", currency: "Australian dollar (AUD)", regionWord: "state",
    context: [
      "Australia has the hardest clock on Upwork. When US clients post during their morning, most of Australia is asleep; by the time an Australian freelancer opens the feed, a good job can already have dozens of proposals. Timing, more than anything else, is what a bidder fixes for an Australian account.",
      "The other side of that clock is an advantage: Australian and New Zealand clients post while the rest of the English-speaking world is offline, and local freelancers who answer those jobs quickly face far less competition.",
    ],
    cities: [
      c("sydney", "Sydney", "New South Wales", "Australia/Sydney", -33.8688, 151.2093),
      c("melbourne", "Melbourne", "Victoria", "Australia/Melbourne", -37.8136, 144.9631),
      c("brisbane", "Brisbane", "Queensland", "Australia/Brisbane", -27.4698, 153.0251),
      c("perth", "Perth", "Western Australia", "Australia/Perth", -31.9523, 115.8613),
      c("adelaide", "Adelaide", "South Australia", "Australia/Adelaide", -34.9285, 138.6007),
      c("canberra", "Canberra", "Australian Capital Territory", "Australia/Sydney", -35.2809, 149.13),
    ],
  },
  {
    slug: "new-zealand", name: "New Zealand", short: "New Zealand", iso: "NZ", hreflang: "en-NZ", currency: "New Zealand dollar (NZD)", regionWord: "region",
    context: [
      "New Zealand is the first English-speaking market to start each working day, and the furthest from the American clients who post most of the work. A freelancer in Auckland who bids only during local office hours is consistently a day behind the US feed.",
      "Covering the hours when New Zealand is asleep is the single most useful thing a bidding team can do for an account here; the profile and proposal quality then decide what happens with the jobs that are reached in time.",
    ],
    cities: [
      c("auckland", "Auckland", "Auckland Region", "Pacific/Auckland", -36.8509, 174.7645),
      c("wellington", "Wellington", "Wellington Region", "Pacific/Auckland", -41.2866, 174.7756),
      c("christchurch", "Christchurch", "Canterbury", "Pacific/Auckland", -43.5321, 172.6362),
    ],
  },
  {
    slug: "ireland", name: "Ireland", short: "Ireland", iso: "IE", hreflang: "en-IE", currency: "euro (EUR)", regionWord: "province",
    context: [
      "Irish freelancers work the same clock as the UK and bill in euros, which makes them a natural fit for both British and continental European clients as well as the US East Coast afternoon.",
      "The market is small enough that most Irish freelancers on Upwork are competing internationally from day one. Positioning around a specific buyer, rather than a general skill, is what makes a profile from a small market stand out in a global search.",
    ],
    cities: [
      c("dublin", "Dublin", "Leinster", "Europe/Dublin", 53.3498, -6.2603),
      c("cork", "Cork", "Munster", "Europe/Dublin", 51.8985, -8.4756),
      c("galway", "Galway", "Connacht", "Europe/Dublin", 53.2707, -9.0568),
    ],
  },
  {
    slug: "south-africa", name: "South Africa", short: "South Africa", iso: "ZA", hreflang: "en-ZA", currency: "South African rand (ZAR)", regionWord: "province",
    context: [
      "South Africa shares most of its working day with the UK and Europe and has a strong English-language services sector, so South African freelancers are well placed for British and European clients and for the first half of the US day.",
      "Because the rand is weaker than the dollar, the temptation is to compete on price. The freelancers who do best from South Africa position on quality and communication instead, and their proposals need to make that case in the first two lines.",
    ],
    cities: [
      c("johannesburg", "Johannesburg", "Gauteng", "Africa/Johannesburg", -26.2041, 28.0473),
      c("cape-town", "Cape Town", "Western Cape", "Africa/Johannesburg", -33.9249, 18.4241),
      c("durban", "Durban", "KwaZulu-Natal", "Africa/Johannesburg", -29.8587, 31.0218),
      c("pretoria", "Pretoria", "Gauteng", "Africa/Johannesburg", -25.7479, 28.2293),
    ],
  },
  {
    slug: "singapore", name: "Singapore", short: "Singapore", iso: "SG", hreflang: "en-SG", currency: "Singapore dollar (SGD)", regionWord: "region",
    context: [
      "Singapore-based freelancers and agencies usually sell specialised, higher-value work — and work a clock that is almost exactly opposite the US. Jobs posted in the American morning arrive late in the Singapore evening.",
      "For agencies in Singapore, the practical question is who watches the feed overnight. A bidder working to an agreed targeting profile means the right jobs are answered while they are new, without anyone on the team staying up for it.",
    ],
    cities: [c("singapore", "Singapore", "Central Region", "Asia/Singapore", 1.3521, 103.8198)],
  },
  {
    slug: "nigeria", name: "Nigeria", short: "Nigeria", iso: "NG", hreflang: "en-NG", currency: "Nigerian naira (NGN)", regionWord: "state",
    context: [
      "Nigeria has one of the fastest-growing freelance communities in Africa, and its working day overlaps well with both the UK and the US East Coast. The talent is there; the common obstacle is a profile and proposals that do not yet give an overseas client enough evidence to take the first chance.",
      "For a newer Nigerian freelancer, the first few contracts matter far more than volume. That means bidding selectively on jobs where existing portfolio work is a close match, and saying so plainly in the opening line.",
    ],
    cities: [
      c("lagos", "Lagos", "Lagos State", "Africa/Lagos", 6.5244, 3.3792),
      c("abuja", "Abuja", "Federal Capital Territory", "Africa/Lagos", 9.0765, 7.3986),
      c("port-harcourt", "Port Harcourt", "Rivers State", "Africa/Lagos", 4.8156, 7.0498),
    ],
  },
  {
    slug: "kenya", name: "Kenya", short: "Kenya", iso: "KE", hreflang: "en-KE", currency: "Kenyan shilling (KES)", regionWord: "county",
    context: [
      "Kenya's freelancers — particularly in writing, virtual assistance, data work and software — work a clock a few hours ahead of the UK and well ahead of the US. The American morning falls in the Kenyan late afternoon and evening.",
      "As in most growing freelance markets, the gap is rarely skill. It is evidence: a profile that leads with a specific service and proof of it gets a very different response from one that lists everything the freelancer could do.",
    ],
    cities: [
      c("nairobi", "Nairobi", "Nairobi County", "Africa/Nairobi", -1.2921, 36.8219),
      c("mombasa", "Mombasa", "Mombasa County", "Africa/Nairobi", -4.0435, 39.6682),
    ],
  },
  {
    slug: "ghana", name: "Ghana", short: "Ghana", iso: "GH", hreflang: "en-GH", currency: "Ghanaian cedi (GHS)", regionWord: "region",
    context: [
      "Ghana sits on Greenwich Mean Time all year, so a Ghanaian freelancer's day lines up almost exactly with the UK's and runs into the US East Coast morning without any late nights.",
      "It is a smaller freelance market than Nigeria's, which makes a clearly positioned profile stand out more easily — provided the proposals reach the right jobs rather than every job.",
    ],
    cities: [
      c("accra", "Accra", "Greater Accra", "Africa/Accra", 5.6037, -0.187),
      c("kumasi", "Kumasi", "Ashanti Region", "Africa/Accra", 6.6885, -1.6244),
    ],
  },
  {
    slug: "philippines", name: "Philippines", short: "the Philippines", iso: "PH", hreflang: "en-PH", currency: "Philippine peso (PHP)", regionWord: "province",
    context: [
      "The Philippines is one of the largest freelance workforces on Upwork, with a long history of serving American clients. Filipino freelancers know the night shift well: the US business day falls squarely in the Philippine night.",
      "With so many freelancers offering similar services, the differentiator is specialisation. A profile and proposals built around one clear service for one kind of client do far better than a general virtual-assistant pitch in a very crowded category.",
    ],
    cities: [
      c("manila", "Manila", "Metro Manila", "Asia/Manila", 14.5995, 120.9842),
      c("quezon-city", "Quezon City", "Metro Manila", "Asia/Manila", 14.676, 121.0437),
      c("cebu-city", "Cebu City", "Cebu", "Asia/Manila", 10.3157, 123.8854),
      c("davao-city", "Davao City", "Davao del Sur", "Asia/Manila", 7.1907, 125.4553),
    ],
  },
  {
    slug: "pakistan", name: "Pakistan", short: "Pakistan", iso: "PK", hreflang: "en-PK", currency: "Pakistani rupee (PKR)", regionWord: "province",
    context: [
      "Pakistan is home — our team works on Pakistan Standard Time — and it is one of the largest freelancing countries in the world. That is also the difficulty: in the most popular categories a Pakistani freelancer is bidding against thousands of profiles that look alike, many of them undercutting on price.",
      "The US morning arrives in the Pakistani evening, so the best jobs are posted just as most freelancers are finishing for the day. Agencies here usually solve that with a dedicated bidder; solo freelancers usually solve it by losing sleep. A written targeting profile and proposals that open on the client's problem are what separate a top Upwork bidder from someone spending Connects.",
    ],
    cities: [
      c("lahore", "Lahore", "Punjab", "Asia/Karachi", 31.5204, 74.3587),
      c("karachi", "Karachi", "Sindh", "Asia/Karachi", 24.8607, 67.0011),
      c("islamabad", "Islamabad", "Islamabad Capital Territory", "Asia/Karachi", 33.6844, 73.0479),
      c("rawalpindi", "Rawalpindi", "Punjab", "Asia/Karachi", 33.5651, 73.0169),
      c("faisalabad", "Faisalabad", "Punjab", "Asia/Karachi", 31.4504, 73.135),
      c("multan", "Multan", "Punjab", "Asia/Karachi", 30.1575, 71.5249),
      c("gujranwala", "Gujranwala", "Punjab", "Asia/Karachi", 32.1877, 74.1945),
      c("sialkot", "Sialkot", "Punjab", "Asia/Karachi", 32.4945, 74.5229),
      c("peshawar", "Peshawar", "Khyber Pakhtunkhwa", "Asia/Karachi", 34.0151, 71.5249),
      c("hyderabad", "Hyderabad", "Sindh", "Asia/Karachi", 25.396, 68.3578),
      c("quetta", "Quetta", "Balochistan", "Asia/Karachi", 30.1798, 66.975),
    ],
  },
  {
    slug: "india", name: "India", short: "India", iso: "IN", hreflang: "en-IN", currency: "Indian rupee (INR)", regionWord: "state",
    context: [
      "India has one of the largest pools of freelancers and agencies on Upwork, and with it some of the heaviest competition in development, design and digital marketing. An Indian profile is rarely short on skills or experience — it is short on anything that distinguishes it from the next two hundred.",
      "Indian Standard Time puts the US East Coast morning in the early evening and the West Coast morning late at night. Agencies in India commonly run a dedicated bidding desk for exactly that reason. What a good bidder adds beyond coverage is selectivity: fewer proposals, sent earlier, each written to the brief.",
    ],
    cities: [
      c("mumbai", "Mumbai", "Maharashtra", "Asia/Kolkata", 19.076, 72.8777),
      c("delhi", "Delhi", "Delhi", "Asia/Kolkata", 28.6139, 77.209),
      c("bengaluru", "Bengaluru", "Karnataka", "Asia/Kolkata", 12.9716, 77.5946),
      c("hyderabad", "Hyderabad", "Telangana", "Asia/Kolkata", 17.385, 78.4867),
      c("chennai", "Chennai", "Tamil Nadu", "Asia/Kolkata", 13.0827, 80.2707),
      c("pune", "Pune", "Maharashtra", "Asia/Kolkata", 18.5204, 73.8567),
      c("kolkata", "Kolkata", "West Bengal", "Asia/Kolkata", 22.5726, 88.3639),
      c("ahmedabad", "Ahmedabad", "Gujarat", "Asia/Kolkata", 23.0225, 72.5714),
      c("surat", "Surat", "Gujarat", "Asia/Kolkata", 21.1702, 72.8311),
      c("jaipur", "Jaipur", "Rajasthan", "Asia/Kolkata", 26.9124, 75.7873),
      c("noida", "Noida", "Uttar Pradesh", "Asia/Kolkata", 28.5355, 77.391),
      c("lucknow", "Lucknow", "Uttar Pradesh", "Asia/Kolkata", 26.8467, 80.9462),
      c("gurugram", "Gurugram", "Haryana", "Asia/Kolkata", 28.4595, 77.0266),
      c("chandigarh", "Chandigarh", "Chandigarh", "Asia/Kolkata", 30.7333, 76.7794),
      c("indore", "Indore", "Madhya Pradesh", "Asia/Kolkata", 22.7196, 75.8577),
      c("kochi", "Kochi", "Kerala", "Asia/Kolkata", 9.9312, 76.2673),
    ],
  },
  {
    slug: "bangladesh", name: "Bangladesh", short: "Bangladesh", iso: "BD", hreflang: "en-BD", currency: "Bangladeshi taka (BDT)", regionWord: "division",
    context: [
      "Bangladesh has a very large and fast-growing freelance community, especially in design, web development and digital marketing. As in Pakistan and India, the challenge is standing out in categories where many profiles look the same and compete on price.",
      "Bangladesh is an hour ahead of Pakistan, so the US working day starts in the Bangladeshi evening and runs past midnight. A bidder covering those hours — and a profile that leads with a specific service rather than a list of tools — is the practical route out of the low-price end of the market.",
    ],
    cities: [
      c("dhaka", "Dhaka", "Dhaka Division", "Asia/Dhaka", 23.8103, 90.4125),
      c("chattogram", "Chattogram", "Chattogram Division", "Asia/Dhaka", 22.3569, 91.7832),
      c("sylhet", "Sylhet", "Sylhet Division", "Asia/Dhaka", 24.8949, 91.8687),
      c("khulna", "Khulna", "Khulna Division", "Asia/Dhaka", 22.8456, 89.5403),
      c("rajshahi", "Rajshahi", "Rajshahi Division", "Asia/Dhaka", 24.3745, 88.6042),
    ],
  },
];

export const LOCATIONS_BASE = "/upwork-bidding-agency";
export const countryPath = (country: Country) => `${LOCATIONS_BASE}/${country.slug}`;
export const cityPath = (country: Country, city: City) => `${LOCATIONS_BASE}/${country.slug}/${city.slug}`;

const COUNTRY_BY_SLUG = new Map(COUNTRIES.map(country => [country.slug, country]));
export const getCountry = (slug: string) => COUNTRY_BY_SLUG.get(slug);
export const getCity = (country: Country, slug: string) => country.cities.find(city => city.slug === slug);

/** Distinct states / provinces in a country, in the order their first city appears. */
export function regionsOf(country: Country): { region: string; cities: City[] }[] {
  const groups = new Map<string, City[]>();
  for (const city of country.cities) groups.set(city.region, [...(groups.get(city.region) ?? []), city]);
  return [...groups.entries()].map(([region, cities]) => ({ region, cities }));
}

export const TOTAL_CITIES = COUNTRIES.reduce((sum, country) => sum + country.cities.length, 0);

// City pages are the ones most at risk of being judged "thin". A city page is indexable only when
// it has a hand-written note in city-notes.ts — a city added here without one still gets a working
// page for visitors, but search engines are asked not to index it and it stays out of the sitemap.
// SEO_INDEX_CITY_PAGES=false switches every city page to noindex at once, without deleting anything.
export const indexCityPages = () => process.env.SEO_INDEX_CITY_PAGES !== "false";
export const cityIsIndexable = (country: Country, city: City) => indexCityPages() && Boolean(cityNote(country.slug, city.slug));

/** Great-circle distance in km — used to list the cities that are actually nearest, not just alphabetical. */
export function distanceKm(a: City, b: City): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// The client markets whose working day a freelancer has to plan around.
export const CLIENT_MARKETS = [
  { label: "US East Coast", city: "New York", tz: "America/New_York" },
  { label: "US West Coast", city: "San Francisco", tz: "America/Los_Angeles" },
  { label: "United Kingdom", city: "London", tz: "Europe/London" },
  { label: "Australia (east)", city: "Sydney", tz: "Australia/Sydney" },
] as const;
