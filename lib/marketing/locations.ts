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
      "More client money on Upwork comes from the United States than from anywhere else. If you're an American freelancer or agency, that puts you in the same time zone as your clients and in competition with the whole world for their attention. You'll rarely win on price. You win by sending the proposal that sounds local, specific and low-risk.",
      "US agencies are usually short of hours, and there's no shortage of jobs to go for. Senior people end up doing the bidding because nobody else can speak for the work, and that time comes out of billable hours. A dedicated bidder who follows a written targeting profile gives those hours back, and the standard of what gets sent stays the same.",
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
      "British freelancers are in a handy spot on Upwork. The working day overlaps with European clients in the morning and with the US East Coast in the afternoon. The catch is that many of the best American jobs go up after UK office hours, when a freelancer working alone has stopped checking the feed.",
      "UK clients and agencies tend to write detailed briefs, and they expect a proposal that answers them point by point. They spot a templated opening straight away. That suits the way we bid, which starts with reading the brief properly and sending fewer proposals.",
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
      "Canadian freelancers share time zones with most of Upwork's American clients, so they don't have the timing problem that most of the world has. It also means they're up against American freelancers for the same jobs, and in that contest clear positioning counts for more than speed.",
      "Canada covers several time zones, so a freelancer in Vancouver and one in Toronto see the same job at very different points in their day. A bidder who covers the feed from early Eastern time to late Pacific time closes that gap.",
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
      "Australia has the hardest clock on Upwork. When American clients post in their morning, most of Australia is asleep. By the time an Australian freelancer opens the feed, a good job can already have dozens of proposals. Timing is the main thing a bidder fixes for an Australian account.",
      "The same clock works in your favour closer to home. Australian and New Zealand clients post while the rest of the English-speaking world is offline, and local freelancers who answer those jobs quickly face far less competition.",
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
      "New Zealand is the first English-speaking country to start each working day, and it's the furthest from the American clients who post most of the work. A freelancer in Auckland who only bids during local office hours is always about a day behind the US feed.",
      "The most useful thing a bidding team can do for a New Zealand account is cover the hours when the country is asleep. Once the jobs are reached in time, your profile and the quality of the proposal decide what happens next.",
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
      "Irish freelancers keep the same hours as the UK and bill in euros. That makes them an easy fit for British and continental European clients, and for American East Coast clients in the afternoon.",
      "Ireland is a small market, so most Irish freelancers on Upwork compete internationally from their first day. A profile from a small country gets noticed in a global search when it's aimed at one specific buyer. A general skill on its own won't do that.",
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
      "South Africa shares most of its working day with the UK and Europe and has a strong English-language services sector. South African freelancers are well placed for British and European clients, and for the first half of the American day.",
      "The rand is weaker than the dollar, so it's tempting to compete on price. The South African freelancers who do best sell on quality and communication, and their proposals have to make that case in the first two lines.",
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
      "Freelancers and agencies in Singapore usually sell specialised, higher-value work. They also work a clock that's almost the opposite of America's, so jobs posted in the American morning arrive late in the Singapore evening.",
      "For an agency in Singapore the practical question is who watches the feed overnight. With a bidder working to an agreed targeting profile, the right jobs get answered while they're new and nobody on your team has to stay up.",
    ],
    cities: [c("singapore", "Singapore", "Central Region", "Asia/Singapore", 1.3521, 103.8198)],
  },
  {
    slug: "nigeria", name: "Nigeria", short: "Nigeria", iso: "NG", hreflang: "en-NG", currency: "Nigerian naira (NGN)", regionWord: "state",
    context: [
      "Nigeria has one of the fastest-growing freelance communities in Africa, and its working day overlaps well with both the UK and the US East Coast. The talent is there. What often holds people back is a profile and proposals that don't yet give an overseas client enough proof to take a first chance on them.",
      "If you're a newer Nigerian freelancer, your first few contracts matter far more than the number of proposals you send. Bid on the jobs where your portfolio is a close match, and say so in your opening line.",
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
      "Kenyan freelancers are strong in writing, virtual assistance, data work and software. Kenya's clock is a few hours ahead of the UK and well ahead of the US, so the American morning falls in the late afternoon and evening in Kenya.",
      "As in most growing freelance markets, skill is rarely the problem. Proof is. A profile that leads with one service and shows evidence of it gets a very different response from one that lists everything the freelancer could do.",
    ],
    cities: [
      c("nairobi", "Nairobi", "Nairobi County", "Africa/Nairobi", -1.2921, 36.8219),
      c("mombasa", "Mombasa", "Mombasa County", "Africa/Nairobi", -4.0435, 39.6682),
    ],
  },
  {
    slug: "ghana", name: "Ghana", short: "Ghana", iso: "GH", hreflang: "en-GH", currency: "Ghanaian cedi (GHS)", regionWord: "region",
    context: [
      "Ghana stays on Greenwich Mean Time all year. A Ghanaian freelancer's day lines up almost exactly with the UK's and runs into the US East Coast morning, with no late nights needed.",
      "Ghana's freelance market is smaller than Nigeria's, which makes it easier for a clearly positioned profile to stand out. That only works if your proposals go to the right jobs and not to every job.",
    ],
    cities: [
      c("accra", "Accra", "Greater Accra", "Africa/Accra", 5.6037, -0.187),
      c("kumasi", "Kumasi", "Ashanti Region", "Africa/Accra", 6.6885, -1.6244),
    ],
  },
  {
    slug: "philippines", name: "Philippines", short: "the Philippines", iso: "PH", hreflang: "en-PH", currency: "Philippine peso (PHP)", regionWord: "province",
    context: [
      "The Philippines has one of the largest freelance workforces on Upwork and a long history of working for American clients. Filipino freelancers know the night shift well, because the American business day falls right in the middle of the Philippine night.",
      "So many freelancers offer similar services that specialising is the way to stand out. A profile and proposals built around one service for one kind of client do far better than a general virtual-assistant pitch in a very crowded category.",
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
      "Pakistan is home. Our team works on Pakistan Standard Time, and this is one of the biggest freelancing countries in the world. That's also what makes it hard. In the most popular categories a Pakistani freelancer is bidding against thousands of profiles that look the same, and many of them are cheaper.",
      "The American morning arrives in the Pakistani evening, so the best jobs go up just as most freelancers are finishing for the day. Agencies here usually deal with that by hiring a dedicated bidder, and solo freelancers usually deal with it by losing sleep. A top Upwork bidder works from a written targeting profile and opens every proposal on the client's problem. Without those two things, bidding is mostly a way of spending Connects.",
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
      "India has one of the largest pools of freelancers and agencies on Upwork, and some of the heaviest competition in development, design and digital marketing. An Indian profile rarely lacks skills or experience. What it usually lacks is anything that sets it apart from the next two hundred.",
      "On Indian Standard Time the US East Coast morning falls in the early evening and the West Coast morning late at night. That's why so many Indian agencies run a dedicated bidding desk. A good bidder covers those hours and is also selective, which means fewer proposals, sent earlier, each one written to the brief.",
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
      "Bangladesh has a very large and fast-growing freelance community, especially in design, web development and digital marketing. As in Pakistan and India, the hard part is standing out in categories where many profiles look the same and compete on price.",
      "Bangladesh is an hour ahead of Pakistan, so the American working day starts in the Bangladeshi evening and runs past midnight. The practical way out of the low-price end of the market is a bidder who covers those hours and a profile that leads with one specific service.",
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
