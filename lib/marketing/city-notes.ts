// What is actually different about each city, written by hand.
//
// This file is the answer to the "doorway page" problem described at the top of locations.ts. A
// city page that differs from its neighbour only by the place name is exactly what search engines
// demote, and inside one country every city shares a time zone — so the clock table alone cannot
// tell Lahore from Karachi. Each city therefore carries:
//
//   scene — what the city's working economy is known for, and what that means for a bid.
//   work  — the three kinds of work most associated with it, each of which pulls in its own
//           guidance from WORK below (what clients screen for, how the proposal should open).
//
// Rules for editing: no statistics, no rankings, no "number one" claims — only things that are
// widely known and stay true for years. A city with no entry here is NOT given filler; its page is
// marked noindex instead (see cityIsIndexable in locations.ts).

export type WorkKey =
  | "web" | "mobile" | "design" | "marketing" | "writing" | "data" | "ecommerce" | "video"
  | "support" | "finance" | "cloud" | "games" | "engineering" | "enterprise" | "sales";

export type WorkType = { label: string; short: string; screen: string; open: string };

export const WORK: Record<WorkKey, WorkType> = {
  web: {
    label: "Web & software development", short: "web development",
    screen: "A finished project in the same stack, and some sign that you read the technical brief properly. Clients in this category have often been let down by a developer who said yes to everything.",
    open: "Name the stack and the hardest part of the brief in your first two lines. Link one build that's close to it and say what the first milestone would deliver.",
  },
  mobile: {
    label: "Mobile app development", short: "mobile apps",
    screen: "Apps that are live in the App Store or on Google Play, and a clear answer on native or cross-platform. A store link does more for you than any description of your skills.",
    open: "Start with a published app of the same kind. Say which platforms you'd build for and why, and raise the store-review or backend risk before the client has to ask.",
  },
  design: {
    label: "Design & branding", short: "design",
    screen: "A portfolio piece from the client's own industry. Design clients look before they read, so the wrong sample can lose you the job before your first sentence.",
    open: "Attach the one piece of past work that's closest. Describe the problem it solved and leave the tools out, then say how many concepts and revision rounds the price covers.",
  },
  marketing: {
    label: "Digital marketing & SEO", short: "digital marketing",
    screen: "Proof of a result on a similar account, with the starting point shown. Marketing clients are wary of screenshots with no context, and of anyone who promises rankings.",
    open: "Open with one thing you noticed about the client's own site or ads. Follow it with a past result, before and after, and say what you'd check in the first week.",
  },
  writing: {
    label: "Writing & content", short: "writing",
    screen: "A sample on the client's subject, in their tone. Editors treat the first paragraph of your proposal as a writing test.",
    open: "Write your opening the way the finished piece would read. Link one published sample on the same subject and confirm the word count, sources and turnaround.",
  },
  data: {
    label: "Data, analytics & AI", short: "data & AI",
    screen: "Evidence that you understood the data before you suggested a model or a dashboard. Vague talk about AI is the most common reason these proposals get skipped.",
    open: "Say back the question the client is really asking of their data. Name the approach you'd try first and why, and describe what a first deliverable would look like after a week.",
  },
  ecommerce: {
    label: "E-commerce & Shopify", short: "e-commerce",
    screen: "Live stores you've worked on, and whether you understand conversion as well as theme setup. Store owners think in orders. They don't think in pages.",
    open: "Mention the client's store or product directly and point to one live store you built or improved. Tie the work to a number they care about, such as speed, checkout completion or average order value.",
  },
  video: {
    label: "Video, animation & creative production", short: "video & animation",
    screen: "A reel in the same style and length as the brief. A client who wants a 30-second product video won't sit through a wedding montage.",
    open: "Link the one piece that's most similar. Say what you need from the client, such as footage, a script or brand assets, and give a delivery date along with the number of revision rounds.",
  },
  support: {
    label: "Virtual assistance & customer support", short: "virtual assistance",
    screen: "Reliability, overlap with their working hours and good written English. These clients are hiring for the long term, so they read a proposal for care and aren't looking for flair.",
    open: "Say which hours you cover in the client's time zone and name the tools from their brief that you already use. Then describe one process you ran from start to finish for a past client.",
  },
  finance: {
    label: "Accounting, finance & bookkeeping", short: "accounting & finance",
    screen: "The right country and the right software, because a US bookkeeper and a UK one can't be swapped for each other. They also look for signs that you're careful with financial records.",
    open: "Name the accounting system and the country you work in. Describe a client of a similar size and explain how you'd handle access to their books.",
  },
  cloud: {
    label: "Cloud, DevOps & security", short: "cloud & DevOps",
    screen: "Confidence that you won't break production. Clients look for the same cloud provider, the same scale and a calm account of how you make changes safely.",
    open: "Repeat the client's stack back to them and describe one similar migration or incident you handled. Then outline how you'd stage the change before touching anything live.",
  },
  games: {
    label: "Game development", short: "game development",
    screen: "A playable build or a shipped title in the same engine. Studios and solo founders both judge by what they can see running.",
    open: "Name the engine and the platform and link something playable. Keep the first milestone small. A prototype of one mechanic is easier to trust than a promise of a whole game.",
  },
  engineering: {
    label: "Engineering, CAD & architecture", short: "engineering & CAD",
    screen: "Drawings or models of the same type, the standards you work to, and the software and file formats you deliver in.",
    open: "Refer to the client's drawing or specification directly and attach one similar piece of your own. Confirm units, standards and file formats at the start.",
  },
  enterprise: {
    label: "ERP, CRM & enterprise systems", short: "CRM & enterprise systems",
    screen: "Experience with the exact platform and module, whether that's Salesforce, SAP, Dynamics or Odoo, and with businesses of a similar size. Certifications help, but a description of a real implementation helps more.",
    open: "Name the platform and the module and describe one implementation of a similar size. Make clear which parts are configuration and which would need custom development.",
  },
  sales: {
    label: "Sales & lead generation", short: "lead generation",
    screen: "A clear method and honest numbers. Many of these clients have been sold inflated lead counts before, and they want someone who can explain how a list is built.",
    open: "Describe the ideal customer in the client's own words and explain how you'd find and verify contacts. Give a weekly volume you can really deliver, and skip the headline figure.",
  },
};

export type CityNote = { scene: string; work: [WorkKey, WorkKey, WorkKey] };

// Keyed "<country slug>/<city slug>".
export const CITY_NOTES: Record<string, CityNote> = {
  // ---------------------------------------------------------------- United States
  "united-states/new-york": {
    scene: "Finance, media, advertising and fashion drive most of the work in New York, and buyers there are used to agency-level presentation. If you're bidding from New York you'll usually be the expensive name on the shortlist. Your proposal has to sell your judgement and how quickly you communicate, because you won't win on price.",
    work: ["marketing", "design", "finance"],
  },
  "united-states/los-angeles": {
    scene: "Los Angeles runs on entertainment, the creator economy and consumer brands that sell direct. A lot of the work is visual and comes with tight deadlines. Clients often decide from a reel or a storefront before they read a word, so the sample you attach matters more than your cover letter.",
    work: ["video", "design", "ecommerce"],
  },
  "united-states/chicago": {
    scene: "Chicago's economy leans towards companies that sell to other companies, in logistics, trading, manufacturing, food and consumer goods. Buyers from that world care about reliability and process. A proposal that explains how the work will be run usually beats one that leads with creative ideas.",
    work: ["enterprise", "data", "marketing"],
  },
  "united-states/houston": {
    scene: "Houston is the centre of the American energy industry. It also has one of the world's largest medical complexes and a long history in aerospace. If you're a specialist there, your buyers are probably technical and regulated, and your Upwork profile should say that plainly. Presenting yourself as a generalist hides your best selling point.",
    work: ["engineering", "data", "enterprise"],
  },
  "united-states/dallas": {
    scene: "Dallas is a headquarters city. Telecoms, finance, airlines and logistics companies all have large corporate operations there. Freelancers and small agencies in Dallas often sell to mid-sized companies, and those buyers respond to a proposal that talks about budgets, stakeholders and timelines.",
    work: ["enterprise", "sales", "web"],
  },
  "united-states/austin": {
    scene: "Austin has one of the busiest startup and software communities in the United States, and a semiconductor industry that has been there for decades. On Upwork you're up against product-minded developers from everywhere. Your bid needs to show the thinking behind the build as well as your ability to code it.",
    work: ["web", "mobile", "cloud"],
  },
  "united-states/san-francisco": {
    scene: "Venture-backed software and much of today's AI industry are concentrated in San Francisco. Rates there are among the highest anywhere. A San Francisco freelancer only wins on Upwork when the first lines of the proposal make it obvious how senior they are.",
    work: ["data", "web", "cloud"],
  },
  "united-states/san-diego": {
    scene: "San Diego mixes biotech and life sciences with defence, wireless technology and tourism. Much of the local expertise is scientific or technical. It sells best on Upwork when your profile names the niche precisely enough for the right client to recognise it straight away.",
    work: ["engineering", "data", "mobile"],
  },
  "united-states/seattle": {
    scene: "Seattle is a cloud and e-commerce city, shaped by the big technology companies based in and around it, and it has a strong games industry too. Engineers who come out of those companies have experience of working at scale, and clients will pay for that. The proposal has to show how it applies to the client's much smaller problem.",
    work: ["cloud", "ecommerce", "games"],
  },
  "united-states/miami": {
    scene: "Miami is where a lot of business between the United States and Latin America gets done. Hospitality and real estate are big there, and finance and technology are growing. If you work in both English and Spanish, that's a real advantage in Miami. Put it in the first line of your profile and don't leave it at the bottom of a skills list.",
    work: ["marketing", "sales", "design"],
  },
  "united-states/boston": {
    scene: "Boston's economy is built on its universities, hospitals, biotech firms and robotics companies. Clients from that world expect rigour and credentials. If you're a Boston specialist, your proposals will do best when they describe your method and a similar project, and leave the adjectives out.",
    work: ["data", "writing", "engineering"],
  },
  "united-states/atlanta": {
    scene: "Atlanta is a logistics hub and a centre for payments and fintech. It's also one of the busiest places in the country for film and television production. That mix produces both technical and creative freelancers, and whichever one you are, your profile should pick a single lane.",
    work: ["video", "finance", "web"],
  },
  "united-states/philadelphia": {
    scene: "The biggest employers in Philadelphia are in healthcare, pharmaceuticals and higher education. Work for those sectors comes with a lot of compliance and detail. Your proposal should show that you understood the constraints as well as the task.",
    work: ["writing", "data", "design"],
  },
  "united-states/washington-dc": {
    scene: "The market in Washington is government contracting, policy work, associations and non-profits, and buyers there are used to formal proposals. If your response follows the structure of the brief and answers each requirement in order, they'll read it as competent. They won't find it stiff.",
    work: ["writing", "data", "web"],
  },
  "united-states/denver": {
    scene: "Denver has grown into a technology and aerospace centre, and it also has telecoms, energy and a cluster of outdoor consumer brands. It's on Mountain Time, two hours behind the East Coast and one ahead of the West Coast. That makes it easy to share a full working day with clients on either side.",
    work: ["web", "ecommerce", "marketing"],
  },
  "united-states/phoenix": {
    scene: "Phoenix has become a centre for semiconductor manufacturing, on top of its older real estate, healthcare and customer-service industries. Arizona doesn't change its clocks, so the gap between you and your clients shifts twice a year. Keep that in mind when you tell a client which hours you cover.",
    work: ["support", "sales", "engineering"],
  },

  // ---------------------------------------------------------------- United Kingdom
  "united-kingdom/london": {
    scene: "London is a world centre for finance, fintech, law, media and advertising. Its freelancers charge at the top of the market. On Upwork that only works if your proposal shows knowledge of the sector that a cheaper bidder couldn't fake.",
    work: ["finance", "marketing", "design"],
  },
  "united-kingdom/manchester": {
    scene: "Manchester has one of the largest digital and creative sectors in England outside London. Broadcasting and production are based at MediaCity in neighbouring Salford, and there's a strong e-commerce scene. Agencies there often use Upwork to fill gaps between retained clients.",
    work: ["ecommerce", "video", "web"],
  },
  "united-kingdom/birmingham": {
    scene: "Birmingham and the West Midlands have a long history in engineering and car making, and these days there are large professional-services offices too. If you have industrial experience, mention it on your profile. Not many people on Upwork do.",
    work: ["engineering", "enterprise", "web"],
  },
  "united-kingdom/leeds": {
    scene: "Leeds is known for financial and legal services and for digital health, and major national health-technology teams are based in the city. If you've done regulated work or handled sensitive data, lead with that.",
    work: ["finance", "data", "web"],
  },
  "united-kingdom/liverpool": {
    scene: "Liverpool has had a games industry for decades. It also has a strong music and cultural scene and a working port. Creative and games freelancers there compete with the whole world on Upwork, and a sample the client can play or watch does most of the selling.",
    work: ["games", "design", "video"],
  },
  "united-kingdom/bristol": {
    scene: "Bristol has aerospace and advanced engineering on one side and animation and natural-history film-making on the other. That gives the city both technical specialists and high-end creative freelancers. Their proposals shouldn't look anything like each other.",
    work: ["engineering", "video", "design"],
  },
  "united-kingdom/glasgow": {
    scene: "Glasgow is Scotland's largest city. It grew up on engineering and shipbuilding and now has a sizeable financial-services sector and an active creative community. Freelancers there work UK hours, and their late afternoon overlaps with the American morning.",
    work: ["engineering", "design", "finance"],
  },
  "united-kingdom/edinburgh": {
    scene: "Edinburgh is a financial centre, especially for investment management and insurance. Its university has one of the strongest computing and AI departments in Europe. If you work in data or fintech in Edinburgh, that reputation is worth bidding on.",
    work: ["data", "finance", "writing"],
  },
  "united-kingdom/cardiff": {
    scene: "Cardiff is the seat of the Welsh government and a major centre for television drama production. Insurance and fintech firms are based there as well. If you can work in both Welsh and English, say so on your profile, because few freelancers can.",
    work: ["video", "writing", "web"],
  },
  "united-kingdom/belfast": {
    scene: "Belfast is known internationally for cybersecurity and financial technology, and many overseas companies run engineering teams in the city. There are also large film and television studios on the old shipyard site. Security specialists are especially hard to find on Upwork, which works in your favour if you are one.",
    work: ["cloud", "web", "video"],
  },

  // ---------------------------------------------------------------- Canada
  "canada/toronto": {
    scene: "Toronto is Canada's financial capital and a well-known centre for artificial-intelligence research. It has a large film and media industry too. The city is in the same time zone as New York, so Toronto freelancers see East Coast jobs as soon as they're posted.",
    work: ["data", "finance", "video"],
  },
  "canada/ottawa": {
    scene: "Ottawa is the federal capital. It has a long history in telecommunications, and one of the world's best-known e-commerce platforms started there. Many freelancers in Ottawa deliver work in both English and French, and clients value that.",
    work: ["ecommerce", "writing", "cloud"],
  },
  "canada/montreal": {
    scene: "Montreal is one of the world's main cities for video-game development and a centre for visual effects and AI research. People there work in both French and English. If you do creative-technical work in Montreal you're competing with studios, so your portfolio needs to look like a studio's.",
    work: ["games", "video", "data"],
  },
  "canada/vancouver": {
    scene: "Vancouver is known for film, television, visual effects and animation, and it has a strong games and software scene. It's on Pacific Time, so your day lines up with clients in California, and you're well placed for Asia-Pacific clients later on.",
    work: ["video", "games", "web"],
  },
  "canada/calgary": {
    scene: "Calgary is the headquarters of Canada's energy industry, and the city has been building up a technology sector next to it. If you're an engineer or analyst with energy experience, you have a niche that few Upwork freelancers can claim.",
    work: ["engineering", "data", "enterprise"],
  },
  "canada/edmonton": {
    scene: "Edmonton is the capital of Alberta. Its main employers are in the public sector and energy services, and its university is known around the world for machine-learning research. Data specialists there can point to that research background when they bid.",
    work: ["data", "engineering", "web"],
  },
  "canada/winnipeg": {
    scene: "Winnipeg's economy is spread across manufacturing, agribusiness, insurance and transport. The city is on Central Time, between Canada's two coasts. A freelancer there can cover the Eastern morning and the Pacific afternoon in a normal working day.",
    work: ["finance", "support", "web"],
  },

  // ---------------------------------------------------------------- Australia
  "australia/sydney": {
    scene: "Sydney is Australia's financial and corporate centre and has a strong fintech and media industry. Local rates are high, and the American working day falls in the middle of the night. To win US clients from Sydney, your proposals need to go out while the city is asleep.",
    work: ["finance", "marketing", "web"],
  },
  "australia/melbourne": {
    scene: "Melbourne is often called Australia's design and cultural capital, and it has large education, retail and health sectors. Designers and marketers there do well with local and New Zealand clients during the day. Reaching British and American clients means bidding outside office hours.",
    work: ["design", "ecommerce", "marketing"],
  },
  "australia/brisbane": {
    scene: "Brisbane serves Queensland's mining, construction and logistics industries and has a growing technology and games community. Queensland doesn't use daylight saving, so Brisbane is an hour behind Sydney for half the year. Clients like being told that up front.",
    work: ["engineering", "games", "web"],
  },
  "australia/perth": {
    scene: "Perth is the base of Australia's mining and resources industry. It shares a time zone with Singapore and much of East Asia, which makes it the best-placed Australian city for working with Asian clients in real time.",
    work: ["engineering", "data", "enterprise"],
  },
  "australia/adelaide": {
    scene: "Adelaide has sizeable defence and space industries and a famous wine region close by. Costs are lower than in the east-coast capitals. The city runs half an hour behind Sydney, which is unusual enough that you should spell it out when you offer meeting times.",
    work: ["engineering", "marketing", "design"],
  },
  "australia/canberra": {
    scene: "Canberra is the national capital, so the market there is government, defence, policy and the universities. Freelancers in Canberra are used to formal tender responses, and that experience carries over well to Upwork's larger, more detailed briefs.",
    work: ["writing", "cloud", "data"],
  },

  // ---------------------------------------------------------------- New Zealand
  "new-zealand/auckland": {
    scene: "Auckland is New Zealand's largest city and its commercial centre, and most of the country's corporate, marketing and technology work is done there. It's one of the first big cities to start each day, so the American afternoon arrives in the Auckland morning.",
    work: ["marketing", "web", "design"],
  },
  "new-zealand/wellington": {
    scene: "Wellington is the capital and the home of New Zealand's film and visual-effects industry. It also has a strong government-technology sector. If you've worked in visual effects or public-sector digital projects in Wellington, clients overseas will recognise those credentials.",
    work: ["video", "web", "writing"],
  },
  "new-zealand/christchurch": {
    scene: "Christchurch is the largest city in the South Island. It has engineering, agricultural technology and aerospace companies, and a construction sector shaped by a decade of rebuilding. Technical freelancers there usually have hands-on experience of delivering projects.",
    work: ["engineering", "web", "data"],
  },

  // ---------------------------------------------------------------- Ireland
  "ireland/dublin": {
    scene: "Many American technology companies have their European headquarters in Dublin, and the city also has large financial-services and pharmaceutical sectors. If you've worked inside one of those companies, you can bid on experience of large-scale work that smaller markets seldom produce.",
    work: ["cloud", "finance", "marketing"],
  },
  "ireland/cork": {
    scene: "Cork is Ireland's second city and a major centre for pharmaceutical manufacturing and technology operations. Specialists there often know both the technical side and the regulatory side. Say so on your profile, because few of your competitors can.",
    work: ["engineering", "support", "web"],
  },
  "ireland/galway": {
    scene: "Galway is known internationally for making medical devices, and it has a lively arts and creative community. If you're an engineer or technical writer with medical-technology experience, you're in a narrow niche on Upwork that pays well.",
    work: ["engineering", "writing", "design"],
  },

  // ---------------------------------------------------------------- South Africa
  "south-africa/johannesburg": {
    scene: "Johannesburg is South Africa's commercial and financial capital, home to its banks, mining houses and corporate head offices. The time zone is within an hour or two of the UK and Europe, so working with those clients in real time is easy.",
    work: ["finance", "enterprise", "web"],
  },
  "south-africa/cape-town": {
    scene: "Cape Town has South Africa's most active startup scene and an international film and commercial production industry. It also has a large customer-service outsourcing sector that works for British and European companies. Both creative and technical freelancers find overseas clients from there.",
    work: ["video", "web", "support"],
  },
  "south-africa/durban": {
    scene: "Durban is built around one of Africa's busiest ports, and manufacturing and tourism are important there too. The freelance community is smaller than in Johannesburg or Cape Town, so a clearly specialised profile gets noticed more easily.",
    work: ["support", "design", "sales"],
  },
  "south-africa/pretoria": {
    scene: "Pretoria is South Africa's administrative capital. It has government departments, embassies and major universities, and there's a car industry nearby. Plenty of freelancers there are research-trained or technical. Public bodies and research institutions like a proposal that is structured and sourced, and Pretoria specialists should write the same way on Upwork.",
    work: ["engineering", "data", "writing"],
  },

  // ---------------------------------------------------------------- Singapore
  "singapore/singapore": {
    scene: "Singapore is where many finance, logistics and technology companies run their South-East Asian operations from. Professionals there are expensive by regional standards. To do well on Upwork from Singapore you need to sell senior, specialised work, and you need the American day covered, because it falls overnight.",
    work: ["finance", "data", "enterprise"],
  },

  // ---------------------------------------------------------------- Nigeria
  "nigeria/lagos": {
    scene: "Lagos is the centre of Nigeria's technology and fintech industry and of its film and music business. More and more overseas companies are hiring developers and designers from Lagos. A cautious client will filter hard at first, and a profile with shipped work they can verify is what gets you through.",
    work: ["web", "design", "video"],
  },
  "nigeria/abuja": {
    scene: "Abuja is the federal capital. Government, embassies, non-profits and international development organisations are all concentrated there. A lot of the work is research, reporting and programme support, and it suits proposals that show clear structure and name their sources.",
    work: ["writing", "data", "support"],
  },
  "nigeria/port-harcourt": {
    scene: "Port Harcourt is the hub of Nigeria's oil and gas industry. Engineers and technical specialists there have industry experience that you don't often see on Upwork. Lead your profile with that experience and put your general skills further down.",
    work: ["engineering", "enterprise", "support"],
  },

  // ---------------------------------------------------------------- Kenya
  "kenya/nairobi": {
    scene: "Nairobi is East Africa's technology centre, often called the Silicon Savannah. It's known for mobile-money innovation and as a regional base for the United Nations and many international organisations. Academic and technical writing has been a freelance field there for a long time, and software is growing next to it.",
    work: ["writing", "web", "data"],
  },
  "kenya/mombasa": {
    scene: "Mombasa is Kenya's main port and the centre of its coastal tourism. The freelance community is smaller than Nairobi's. A precise, specialised profile is the quickest way to get noticed from there.",
    work: ["support", "writing", "design"],
  },

  // ---------------------------------------------------------------- Ghana
  "ghana/accra": {
    scene: "Accra is Ghana's capital and its hub for technology and services. For half the year it's on the same clock as London, so working with British clients on the same day is easy. Mornings on the American East Coast fall in the Accra afternoon.",
    work: ["web", "support", "design"],
  },
  "ghana/kumasi": {
    scene: "Kumasi is Ghana's second city and a major trading centre. It's also home to the country's leading science and technology university. More and more of its engineering and computing graduates are turning up on freelance platforms.",
    work: ["engineering", "web", "design"],
  },

  // ---------------------------------------------------------------- Philippines
  "philippines/manila": {
    scene: "Manila is the heart of the outsourcing industry in the Philippines, with decades of experience working for American companies. On Upwork, Filipino freelancers are best known for customer support and virtual assistance, where prices are under constant pressure. Building your profile around one specialised process is how you get out of that.",
    work: ["support", "finance", "design"],
  },
  "philippines/quezon-city": {
    scene: "Quezon City is the largest city in Metro Manila. The country's major broadcast networks and several of its leading universities are based there. The talent covers both media production and outsourcing. If you're a creative freelancer in Quezon City, show samples of broadcast quality.",
    work: ["video", "support", "writing"],
  },
  "philippines/cebu-city": {
    scene: "Cebu City is the second outsourcing and technology hub in the Philippines. It has a strong reputation for design and furniture-making and a big tourism economy. Developers and designers in Cebu often work directly for overseas clients.",
    work: ["web", "design", "support"],
  },
  "philippines/davao-city": {
    scene: "Davao City is the commercial centre of Mindanao. Its economy is based on agribusiness, and the outsourcing sector is growing. Freelancers there usually cover American hours overnight, and that's the time when having a bidder helps most.",
    work: ["support", "sales", "marketing"],
  },

  // ---------------------------------------------------------------- Pakistan
  "pakistan/lahore": {
    scene: "Lahore has one of the largest concentrations of software houses and technology graduates in Pakistan. The Arfa Software Technology Park is there, along with several of the country's leading universities. With so many Lahore developers on Upwork, you stand out by naming one specialism. A profile that lists every framework looks like all the others.",
    work: ["web", "mobile", "design"],
  },
  "pakistan/karachi": {
    scene: "Karachi is Pakistan's financial and commercial capital and its main port. Banks, fintech startups, e-commerce companies and media houses are all based there. The city's freelancers range from finance professionals to large development agencies, and each of them needs a different pitch.",
    work: ["ecommerce", "finance", "web"],
  },
  "pakistan/islamabad": {
    scene: "Islamabad is the capital. It has a cluster of software exporters and telecom companies, and its engineering universities are strong. Agencies there often work for large overseas clients. Proposals that show that level of process tend to win the bigger contracts.",
    work: ["cloud", "data", "enterprise"],
  },
  "pakistan/rawalpindi": {
    scene: "Rawalpindi is Islamabad's twin city and draws on the same pool of talent. It has a large community of independent freelancers and small agencies. Many of them work in the busiest Upwork categories, where the first few lines of a proposal decide whether the client reads the rest.",
    work: ["web", "marketing", "support"],
  },
  "pakistan/faisalabad": {
    scene: "Faisalabad is the centre of Pakistan's textile industry. Many freelancers there know clothing, sourcing and export at first hand. That's useful background for e-commerce and product work, and it's uncommon enough that you should mention it.",
    work: ["ecommerce", "design", "marketing"],
  },
  "pakistan/multan": {
    scene: "Multan is the main city of southern Punjab. Its economy is agricultural, and its freelance community is growing fast. Many freelancers there taught themselves or trained through public skills programmes. If you're still building a job history, a sharp and specific profile is the thing that helps most.",
    work: ["design", "marketing", "support"],
  },
  "pakistan/gujranwala": {
    scene: "Gujranwala is an industrial city full of small and medium-sized manufacturers, and its freelance scene is still young. If you're new to freelancing there, you'll get more from bidding on a few jobs that suit you than from spreading your Connects thin.",
    work: ["design", "web", "support"],
  },
  "pakistan/sialkot": {
    scene: "Sialkot is one of Pakistan's great export cities, known around the world for sports goods, surgical instruments and leather products. Freelancers there understand export trade and product catalogues. That makes them a natural fit for e-commerce and marketplace work.",
    work: ["ecommerce", "sales", "design"],
  },
  "pakistan/peshawar": {
    scene: "Peshawar is the capital of Khyber Pakhtunkhwa. It has well-established universities, and its freelance community has grown quickly with the help of provincial technology programmes. Developers and designers there are in crowded categories, so the safest move is to pick a narrow specialism.",
    work: ["web", "design", "writing"],
  },
  "pakistan/hyderabad": {
    scene: "Hyderabad is the second-largest city in Sindh and sits close to the big engineering and general universities at Jamshoro. A steady stream of graduates from there start freelancing every year. What most of them need is help turning coursework and early projects into a profile clients will trust.",
    work: ["web", "engineering", "support"],
  },
  "pakistan/quetta": {
    scene: "Quetta is the capital of Balochistan. Its freelance community is small and growing, and most of it is centred on the universities. Many freelancers in Quetta are early in their Upwork history. At that stage, picking the right jobs to bid on matters more than sending a lot of proposals.",
    work: ["design", "writing", "support"],
  },

  // ---------------------------------------------------------------- India
  "india/mumbai": {
    scene: "Mumbai is India's financial capital and the home of its film, television and advertising industries. A freelancer there is as likely to be a finance professional or a creative producer as a developer. Make sure your profile says which one you are.",
    work: ["finance", "video", "marketing"],
  },
  "india/delhi": {
    scene: "Delhi and the region around it make up one of India's largest markets for services, media and startups. Agencies there compete hard with each other. On Upwork you can see it in the number of similar profiles bidding on the same jobs, and a targeted proposal is how you get a reply in that crowd.",
    work: ["marketing", "web", "design"],
  },
  "india/bengaluru": {
    scene: "Bengaluru is India's technology capital, packed with software companies, research centres and startups. Many engineers there have worked at product companies. If that's you, bid on the depth of your experience and don't try to match the lowest hourly rate.",
    work: ["data", "cloud", "mobile"],
  },
  "india/hyderabad": {
    scene: "HITEC City in Hyderabad is home to large campuses of global technology companies, and the city is also a centre of India's pharmaceutical industry. There are plenty of developers with experience at large companies. Your proposal has to say which platform you worked on and at what scale.",
    work: ["enterprise", "cloud", "data"],
  },
  "india/chennai": {
    scene: "Chennai is a centre for software-as-a-service companies and for India's car industry, and it has a deep pool of engineering talent. Freelancers there are well placed for product engineering, and for technical work that combines software with manufacturing.",
    work: ["web", "engineering", "enterprise"],
  },
  "india/pune": {
    scene: "Pune has IT services companies, automotive and manufacturing engineering, and a large student population. Many Pune freelancers come from services companies and already know how to deliver. The thing their profile usually needs is a clear specialism.",
    work: ["web", "engineering", "cloud"],
  },
  "india/kolkata": {
    scene: "Kolkata is the commercial centre of eastern India. It has an IT district at Salt Lake and a long tradition in publishing, design and the arts. Web agencies and creative freelancers from Kolkata have been on global platforms for many years.",
    work: ["web", "design", "writing"],
  },
  "india/ahmedabad": {
    scene: "Ahmedabad is the largest city in Gujarat, known for textiles, pharmaceuticals and a strong trading culture. It has a great many small web and mobile agencies, and for a lot of them Upwork is the main source of overseas clients.",
    work: ["mobile", "web", "ecommerce"],
  },
  "india/surat": {
    scene: "Surat is the centre of the world's diamond-cutting trade and of India's synthetic-textile industry. Its community of developers and designers is growing. Many of them think like traders, which suits e-commerce clients well.",
    work: ["ecommerce", "mobile", "design"],
  },
  "india/jaipur": {
    scene: "Jaipur is known for jewellery, handicrafts and tourism, and in recent years it has built a visible startup and IT scene. Design and e-commerce freelancers there can draw on a strong local tradition of craft and export.",
    work: ["design", "ecommerce", "web"],
  },
  "india/noida": {
    scene: "Noida is part of the Delhi region. IT services companies, media houses and electronics manufacturers are all based there, along with a very large number of web and app agencies. For a Noida agency on Upwork, the main problem is looking different from the others.",
    work: ["web", "enterprise", "mobile"],
  },
  "india/lucknow": {
    scene: "Lucknow is the capital of Uttar Pradesh. Its IT sector is growing and it has a large pool of graduates. Many freelancers there are building their first group of overseas clients. At that stage the quality of each proposal matters far more than how many you send.",
    work: ["web", "writing", "support"],
  },
  "india/gurugram": {
    scene: "Gurugram is a corporate city full of multinational offices, consulting firms and well-funded startups. Professionals there bring consulting and finance backgrounds to Upwork. They should present themselves as specialists who serve businesses, and avoid looking like general freelancers.",
    work: ["finance", "sales", "data"],
  },
  "india/chandigarh": {
    scene: "Chandigarh, with neighbouring Mohali and Panchkula, has a surprising number of web and mobile development agencies for its size. Many of them were built almost entirely on overseas freelance platforms. When the agency next door has the same skills as you, your positioning is what sets you apart.",
    work: ["web", "mobile", "marketing"],
  },
  "india/indore": {
    scene: "Indore is the commercial capital of Madhya Pradesh, and it's home to both an Indian Institute of Technology and an Indian Institute of Management. Its technology sector is growing fast, and many small agencies there are looking for overseas work.",
    work: ["web", "mobile", "design"],
  },
  "india/kochi": {
    scene: "Kochi is Kerala's commercial centre and port. It has technology parks and an active startup community backed by the state. Kerala also has a large diaspora in the Gulf, so Kochi freelancers often work for clients in the Middle East as well as in the West.",
    work: ["web", "cloud", "mobile"],
  },

  // ---------------------------------------------------------------- Bangladesh
  "bangladesh/dhaka": {
    scene: "Dhaka is the centre of Bangladesh's software and freelance industries and the headquarters of its garment export trade. A huge number of designers, developers and marketers from the city are on Upwork. The biggest risk for a Dhaka freelancer is a profile that looks just like the next one.",
    work: ["design", "web", "marketing"],
  },
  "bangladesh/chattogram": {
    scene: "Chattogram is Bangladesh's main port and its second city, with an economy built on trade, shipping and industry. The freelance community there is growing. If you know trade or logistics, you already have a niche.",
    work: ["ecommerce", "web", "support"],
  },
  "bangladesh/sylhet": {
    scene: "Sylhet has close family and business ties to the United Kingdom through its large diaspora. For many freelancers there, British clients are a natural first market. UK working hours fall in the Sylhet afternoon and evening, which is convenient.",
    work: ["marketing", "design", "support"],
  },
  "bangladesh/khulna": {
    scene: "Khulna is the main city of south-western Bangladesh. It has an engineering university and a growing community of freelancers. Many of them are early in their Upwork history. For someone at that stage, the most valuable decision is which jobs to bid on.",
    work: ["engineering", "web", "design"],
  },
  "bangladesh/rajshahi": {
    scene: "Rajshahi is known as an education city, with a major public university and an engineering university. Every year its students and graduates add to the number of new freelancers. For them a well-built profile decides how soon the first job comes.",
    work: ["design", "writing", "support"],
  },
};

export const cityNote = (countrySlug: string, citySlug: string): CityNote | undefined => CITY_NOTES[`${countrySlug}/${citySlug}`];
