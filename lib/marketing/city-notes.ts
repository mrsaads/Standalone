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
    screen: "A shipped project in the same stack, and a sign that the technical brief was read rather than skimmed. Clients in this category have been burned by developers who said yes to everything.",
    open: "Name the stack and the hardest part of the brief in the first two lines, link one comparable build, and say what the first milestone would deliver.",
  },
  mobile: {
    label: "Mobile app development", short: "mobile apps",
    screen: "Apps that are live in the App Store or Google Play, and clarity on native versus cross-platform. A store link outweighs any description of skills.",
    open: "Lead with a published app of the same kind, say which platforms you would build for and why, and flag the store-review or backend risk before the client has to ask.",
  },
  design: {
    label: "Design & branding", short: "design",
    screen: "A portfolio piece in the client's own industry. Design clients choose with their eyes first and read second, so the wrong sample loses the job before the first sentence.",
    open: "Attach the one closest piece of past work, describe the problem it solved rather than the tools used, and state how many concepts and revision rounds the price covers.",
  },
  marketing: {
    label: "Digital marketing & SEO", short: "digital marketing",
    screen: "Proof of a result on a comparable account, with the starting point shown. Marketing clients are wary of screenshots without context and of anyone promising rankings.",
    open: "Open on one observation about the client's own site or ads, then a past result with its before and after, and what you would check in the first week.",
  },
  writing: {
    label: "Writing & content", short: "writing",
    screen: "A sample in the client's subject and tone. Editors skim the first paragraph of a proposal as a writing test in itself.",
    open: "Write the opening the way the finished piece would read, link one published sample on the same subject, and confirm word count, sources and turnaround.",
  },
  data: {
    label: "Data, analytics & AI", short: "data & AI",
    screen: "Evidence that you understood the data before proposing a model or a dashboard. Vague claims about AI are the commonest reason these proposals are skipped.",
    open: "Restate the question the client is really asking of their data, name the approach you would try first and why, and say what a first deliverable looks like in a week.",
  },
  ecommerce: {
    label: "E-commerce & Shopify", short: "e-commerce",
    screen: "Live stores you have worked on and whether you understand conversion, not just theme setup. Store owners think in orders, not in pages.",
    open: "Reference the client's store or product directly, point to one live store you built or improved, and tie the work to a number they care about — speed, checkout completion, average order.",
  },
  video: {
    label: "Video, animation & creative production", short: "video & animation",
    screen: "A reel in the same style and length as the brief. A client who wants a 30-second product video does not watch a wedding montage.",
    open: "Link the single most similar piece, state what you need from the client — footage, script, brand assets — and give a delivery date with the number of revision rounds.",
  },
  support: {
    label: "Virtual assistance & customer support", short: "virtual assistance",
    screen: "Reliability, overlap with their working hours and written English. These clients are hiring for a long engagement and read proposals for care, not flair.",
    open: "State the hours you cover in the client's time zone, name the tools from their brief you already use, and describe one process you ran end to end for a past client.",
  },
  finance: {
    label: "Accounting, finance & bookkeeping", short: "accounting & finance",
    screen: "The right jurisdiction and software — a US bookkeeper and a UK one are not interchangeable — plus evidence of discretion with financial records.",
    open: "Name the accounting system and the jurisdiction you work in, describe a client of similar size, and explain how access to their books would be handled.",
  },
  cloud: {
    label: "Cloud, DevOps & security", short: "cloud & DevOps",
    screen: "Certainty that you will not break production. Clients look for the same cloud provider, the same scale, and a calm description of how you make changes safely.",
    open: "Mirror the client's stack back to them, describe one comparable migration or incident you handled, and outline how you would stage the change before touching anything live.",
  },
  games: {
    label: "Game development", short: "game development",
    screen: "A playable build or a shipped title in the same engine. Studios and solo founders alike judge by what they can see running.",
    open: "Name the engine and platform, link something playable, and scope the first milestone tightly — a prototype of one mechanic rather than a promise of a whole game.",
  },
  engineering: {
    label: "Engineering, CAD & architecture", short: "engineering & CAD",
    screen: "Drawings or models of the same type, the standards you work to, and the software and file formats you deliver in.",
    open: "Reference the client's drawing or specification directly, attach one comparable output, and confirm units, standards and file formats up front.",
  },
  enterprise: {
    label: "ERP, CRM & enterprise systems", short: "CRM & enterprise systems",
    screen: "Experience with the exact platform and module — Salesforce, SAP, Dynamics, Odoo — and with businesses of a similar size. Certifications help; a described implementation helps more.",
    open: "Name the platform and module, describe one implementation of comparable scope, and separate what is configuration from what would need custom development.",
  },
  sales: {
    label: "Sales & lead generation", short: "lead generation",
    screen: "A clear method and honest numbers. Clients here have usually been sold inflated lead counts before and are looking for someone who explains how a list is built.",
    open: "Describe the ideal customer in the client's own terms, explain how you would source and verify contacts, and give a realistic weekly volume instead of a headline figure.",
  },
};

export type CityNote = { scene: string; work: [WorkKey, WorkKey, WorkKey] };

// Keyed "<country slug>/<city slug>".
export const CITY_NOTES: Record<string, CityNote> = {
  // ---------------------------------------------------------------- United States
  "united-states/new-york": {
    scene: "New York's work runs on finance, media, advertising and fashion, and buyers there are used to agency-grade presentation. A freelancer or studio bidding from New York is usually the expensive option on the shortlist, so the proposal has to make the case for judgement and speed of communication rather than for price.",
    work: ["marketing", "design", "finance"],
  },
  "united-states/los-angeles": {
    scene: "Los Angeles is built around entertainment, the creator economy and consumer brands that sell direct. Much of the work is visual and deadline-driven, and clients often hire from a reel or a storefront before they read a word — which makes the sample you attach more important than the cover letter.",
    work: ["video", "design", "ecommerce"],
  },
  "united-states/chicago": {
    scene: "Chicago's economy is weighted towards business-to-business companies: logistics, trading, manufacturing, food and consumer goods groups. Clients from that world buy on reliability and process, so proposals that describe how the work will be run tend to beat ones that lead with creativity.",
    work: ["enterprise", "data", "marketing"],
  },
  "united-states/houston": {
    scene: "Houston is the centre of the American energy industry and home to one of the world's largest medical complexes, with aerospace alongside. Specialists there often serve technical, regulated buyers, and the strongest Upwork profiles say so plainly instead of presenting as generalists.",
    work: ["engineering", "data", "enterprise"],
  },
  "united-states/dallas": {
    scene: "Dallas is a headquarters city — telecoms, finance, airlines and logistics all run large corporate operations there. Freelancers and small agencies in Dallas frequently sell to mid-market companies, which reward a proposal that speaks to budgets, stakeholders and timelines.",
    work: ["enterprise", "sales", "web"],
  },
  "united-states/austin": {
    scene: "Austin has one of the densest startup and software communities in the United States, alongside a long-standing semiconductor industry. Local talent competes on Upwork with product-minded developers everywhere, so the bid has to show the thinking behind the build, not just the ability to code it.",
    work: ["web", "mobile", "cloud"],
  },
  "united-states/san-francisco": {
    scene: "San Francisco is where venture-backed software and much of the current AI industry is concentrated. Rates there are among the highest anywhere, which means a San Francisco freelancer wins on Upwork only when the proposal makes seniority obvious in the first lines.",
    work: ["data", "web", "cloud"],
  },
  "united-states/san-diego": {
    scene: "San Diego combines biotech and life sciences with defence, wireless technology and tourism. Much local expertise is scientific or technical, and it sells best on Upwork when the profile names the niche precisely enough that the right client recognises it at once.",
    work: ["engineering", "data", "mobile"],
  },
  "united-states/seattle": {
    scene: "Seattle is a cloud and e-commerce city, shaped by the large technology companies headquartered in and around it, with a deep games industry as well. Engineers leaving that environment bring scale experience that clients will pay for — if the proposal translates it into the client's much smaller problem.",
    work: ["cloud", "ecommerce", "games"],
  },
  "united-states/miami": {
    scene: "Miami is the business gateway between the United States and Latin America, with hospitality, real estate and a growing finance and technology scene. Bilingual English–Spanish work is a real advantage there, and it belongs in the first line of a profile rather than at the bottom of a skills list.",
    work: ["marketing", "sales", "design"],
  },
  "united-states/boston": {
    scene: "Boston's economy rests on its universities, hospitals, biotech and robotics companies. Clients from that world expect rigour and credentials, so proposals from Boston specialists do best when they cite the method and the comparable project rather than adjectives.",
    work: ["data", "writing", "engineering"],
  },
  "united-states/atlanta": {
    scene: "Atlanta is a logistics hub, a payments and fintech centre and one of the busiest film and television production locations in the country. That mix produces freelancers on both the technical and the creative side, each of whom needs a profile that picks one lane.",
    work: ["video", "finance", "web"],
  },
  "united-states/philadelphia": {
    scene: "Philadelphia's largest employers are in healthcare, pharmaceuticals and higher education. Work for those sectors is compliance-heavy and detail-driven, which rewards proposals that show the writer understood the constraints as well as the task.",
    work: ["writing", "data", "design"],
  },
  "united-states/washington-dc": {
    scene: "Washington's market is government contracting, policy, associations and non-profits. Buyers there are used to formal proposals, so a response that mirrors the brief's structure and answers each requirement in order reads as competent rather than stiff.",
    work: ["writing", "data", "web"],
  },
  "united-states/denver": {
    scene: "Denver has grown into a technology and aerospace centre, with telecoms, energy and a strong cluster of outdoor consumer brands. It is on Mountain Time, an hour or two off both coasts, which makes a full day of overlap with clients on either side unusually easy.",
    work: ["web", "ecommerce", "marketing"],
  },
  "united-states/phoenix": {
    scene: "Phoenix has become a semiconductor manufacturing centre alongside its long-standing real estate, healthcare and customer-operations industries. Arizona does not change its clocks, so its offset from client markets shifts twice a year — worth knowing when you tell a client which hours you cover.",
    work: ["support", "sales", "engineering"],
  },

  // ---------------------------------------------------------------- United Kingdom
  "united-kingdom/london": {
    scene: "London is a world centre for finance, fintech, law, media and advertising. Its freelancers are priced at the top of the market, and on Upwork that only works when the proposal shows sector knowledge that a cheaper bidder cannot fake.",
    work: ["finance", "marketing", "design"],
  },
  "united-kingdom/manchester": {
    scene: "Manchester has one of the largest digital and creative sectors in England outside London, with broadcasting and production based at MediaCity in neighbouring Salford and a strong e-commerce scene. Agencies there often use Upwork to fill capacity between retained clients.",
    work: ["ecommerce", "video", "web"],
  },
  "united-kingdom/birmingham": {
    scene: "Birmingham and the West Midlands are historically an engineering and automotive region, now with large professional-services offices. Local specialists often have industrial experience that is rare on Upwork, and it should be named on the profile.",
    work: ["engineering", "enterprise", "web"],
  },
  "united-kingdom/leeds": {
    scene: "Leeds is a centre for financial and legal services and for digital health, with major national health-technology teams based in the city. Freelancers with experience of regulated, data-sensitive work should lead with it.",
    work: ["finance", "data", "web"],
  },
  "united-kingdom/liverpool": {
    scene: "Liverpool has a long-established games industry, a strong music and cultural economy and a working port. Creative and games freelancers there compete globally on Upwork, where a playable or viewable sample does most of the selling.",
    work: ["games", "design", "video"],
  },
  "united-kingdom/bristol": {
    scene: "Bristol pairs aerospace and advanced engineering with animation and natural-history film-making. That combination produces both technical specialists and high-end creative freelancers, two groups whose proposals need to look nothing alike.",
    work: ["engineering", "video", "design"],
  },
  "united-kingdom/glasgow": {
    scene: "Glasgow is Scotland's largest city, with engineering and shipbuilding roots, a sizeable financial-services sector and an active creative community. Its freelancers work UK hours, with late-afternoon overlap into the American morning.",
    work: ["engineering", "design", "finance"],
  },
  "united-kingdom/edinburgh": {
    scene: "Edinburgh is a financial centre, particularly for investment management and insurance, and its university has one of the strongest computing and AI departments in Europe. Data and fintech specialists from Edinburgh should bid on that reputation.",
    work: ["data", "finance", "writing"],
  },
  "united-kingdom/cardiff": {
    scene: "Cardiff is the seat of the Welsh government and a major centre for television drama production, with insurance and fintech firms alongside. Bilingual Welsh–English work is a niche worth stating for anyone who offers it.",
    work: ["video", "writing", "web"],
  },
  "united-kingdom/belfast": {
    scene: "Belfast has built an international reputation in cybersecurity and financial technology, with many overseas companies running engineering teams there, and large film and television studios on the old shipyard site. Security specialists in particular are scarce on Upwork.",
    work: ["cloud", "web", "video"],
  },

  // ---------------------------------------------------------------- Canada
  "canada/toronto": {
    scene: "Toronto is Canada's financial capital and a recognised centre of artificial-intelligence research, with a large film and media industry. It shares a time zone with New York, so Toronto freelancers see American East Coast jobs the moment they are posted.",
    work: ["data", "finance", "video"],
  },
  "canada/ottawa": {
    scene: "Ottawa is the federal capital, with a long history in telecommunications and a software sector that produced one of the world's best-known e-commerce platforms. Bilingual English–French delivery is common and valuable.",
    work: ["ecommerce", "writing", "cloud"],
  },
  "canada/montreal": {
    scene: "Montreal is one of the world's major video-game development cities and a centre for visual effects and AI research, working in both French and English. Creative-technical freelancers there are competing with studios, and need a portfolio that looks like one.",
    work: ["games", "video", "data"],
  },
  "canada/vancouver": {
    scene: "Vancouver is known for film, television, visual effects and animation, with a strong games and software scene. On Pacific Time it is aligned with California's clients and well placed for Asia-Pacific ones later in the day.",
    work: ["video", "games", "web"],
  },
  "canada/calgary": {
    scene: "Calgary is the headquarters of Canada's energy industry and has been deliberately building a technology sector alongside it. Engineers and analysts with energy experience have a niche few Upwork freelancers can claim.",
    work: ["engineering", "data", "enterprise"],
  },
  "canada/edmonton": {
    scene: "Edmonton is Alberta's capital, with public-sector and energy-services employers and a university known internationally for machine-learning research. That research base gives local data specialists a credible story to tell.",
    work: ["data", "engineering", "web"],
  },
  "canada/winnipeg": {
    scene: "Winnipeg has a diversified economy — manufacturing, agribusiness, insurance and transport — and sits on Central Time between Canada's coasts. Freelancers there can cover both the Eastern morning and the Pacific afternoon in an ordinary day.",
    work: ["finance", "support", "web"],
  },

  // ---------------------------------------------------------------- Australia
  "australia/sydney": {
    scene: "Sydney is Australia's financial and corporate centre, with a strong fintech and media industry. Local rates are high, and the American working day falls overnight, so winning US clients from Sydney depends on proposals going out while the city sleeps.",
    work: ["finance", "marketing", "web"],
  },
  "australia/melbourne": {
    scene: "Melbourne is regarded as Australia's design and cultural capital, with large education, retail and health sectors. Its designers and marketers sell well to local and New Zealand clients by day; reaching Britain and America means bidding outside office hours.",
    work: ["design", "ecommerce", "marketing"],
  },
  "australia/brisbane": {
    scene: "Brisbane serves Queensland's mining, construction and logistics industries and has a growing technology and games community. Queensland does not use daylight saving, so Brisbane sits an hour behind Sydney for half the year — a detail clients appreciate being told.",
    work: ["engineering", "games", "web"],
  },
  "australia/perth": {
    scene: "Perth is the base of Australia's mining and resources industry and shares a time zone with Singapore and much of East Asia. That makes it the Australian city best placed to work with Asian clients in real time.",
    work: ["engineering", "data", "enterprise"],
  },
  "australia/adelaide": {
    scene: "Adelaide has significant defence and space industries, a renowned wine region on its doorstep and a lower cost base than the east-coast capitals. It runs half an hour behind Sydney — unusual enough that it is worth spelling out when you offer meeting times.",
    work: ["engineering", "marketing", "design"],
  },
  "australia/canberra": {
    scene: "Canberra is the national capital, and its market is government, defence, policy and the universities. Freelancers there are used to formal tender responses, which translates well to Upwork's larger, more detailed briefs.",
    work: ["writing", "cloud", "data"],
  },

  // ---------------------------------------------------------------- New Zealand
  "new-zealand/auckland": {
    scene: "Auckland is New Zealand's largest city and its commercial centre, where most corporate, marketing and technology work is concentrated. It is among the first major cities to start each day, which puts the American afternoon in the Auckland morning.",
    work: ["marketing", "web", "design"],
  },
  "new-zealand/wellington": {
    scene: "Wellington is the capital and the home of New Zealand's film and visual-effects industry, with a strong government-technology sector. Visual-effects and public-sector digital specialists from Wellington carry credentials that travel well.",
    work: ["video", "web", "writing"],
  },
  "new-zealand/christchurch": {
    scene: "Christchurch is the South Island's largest city, with engineering, agricultural technology and aerospace companies and a construction sector shaped by a decade of rebuilding. Technical freelancers there tend to have practical, project-delivery experience.",
    work: ["engineering", "web", "data"],
  },

  // ---------------------------------------------------------------- Ireland
  "ireland/dublin": {
    scene: "Dublin hosts the European headquarters of many American technology companies, alongside financial services and pharmaceuticals. Freelancers who have worked inside those companies can bid on enterprise-scale experience that smaller markets rarely produce.",
    work: ["cloud", "finance", "marketing"],
  },
  "ireland/cork": {
    scene: "Cork is Ireland's second city and a major centre for pharmaceutical manufacturing and for technology operations. Its specialists often combine technical and regulatory knowledge, which is worth naming because few competitors can.",
    work: ["engineering", "support", "web"],
  },
  "ireland/galway": {
    scene: "Galway is known internationally for medical-device manufacturing and has a lively arts and creative community. Engineers and technical writers with medical-technology experience are in a narrow, well-paid niche on Upwork.",
    work: ["engineering", "writing", "design"],
  },

  // ---------------------------------------------------------------- South Africa
  "south-africa/johannesburg": {
    scene: "Johannesburg is South Africa's commercial and financial capital, home to its banks, mining houses and corporate headquarters. Its time zone sits within an hour or two of the UK and Europe, which makes real-time work with those clients straightforward.",
    work: ["finance", "enterprise", "web"],
  },
  "south-africa/cape-town": {
    scene: "Cape Town has South Africa's most active startup scene, an international film and commercial production industry and a large customer-service outsourcing sector serving British and European companies. Creative and technical freelancers both find overseas clients from there.",
    work: ["video", "web", "support"],
  },
  "south-africa/durban": {
    scene: "Durban is built around one of Africa's busiest ports, with manufacturing and tourism alongside. Its freelance community is smaller than Johannesburg's or Cape Town's, so a clearly specialised profile stands out more easily.",
    work: ["support", "design", "sales"],
  },
  "south-africa/pretoria": {
    scene: "Pretoria is South Africa's administrative capital, with government departments, embassies, major universities and an automotive industry nearby. Research-trained and technical freelancers are well represented. Work for public bodies and research institutions rewards a proposal that is structured and sourced, which is how Pretoria specialists should write on Upwork too.",
    work: ["engineering", "data", "writing"],
  },

  // ---------------------------------------------------------------- Singapore
  "singapore/singapore": {
    scene: "Singapore is a regional headquarters city for finance, logistics and technology across South-East Asia. Its professionals are expensive by regional standards, so Upwork success from Singapore comes from selling senior, specialised work — and from covering the American day, which falls overnight.",
    work: ["finance", "data", "enterprise"],
  },

  // ---------------------------------------------------------------- Nigeria
  "nigeria/lagos": {
    scene: "Lagos is the centre of Nigeria's technology and fintech industry and of its film and music business. Developers and designers there are increasingly hired by overseas companies, and a profile with verifiable shipped work is what gets past a cautious client's first filter.",
    work: ["web", "design", "video"],
  },
  "nigeria/abuja": {
    scene: "Abuja is the federal capital, where government, embassies, non-profits and international development organisations are concentrated. Research, reporting and programme work is common, and it suits proposals that show structure and sources.",
    work: ["writing", "data", "support"],
  },
  "nigeria/port-harcourt": {
    scene: "Port Harcourt is the hub of Nigeria's oil and gas industry. Engineers and technical specialists there have industry experience that is unusual on Upwork, and a profile should lead with it rather than with general skills.",
    work: ["engineering", "enterprise", "support"],
  },

  // ---------------------------------------------------------------- Kenya
  "kenya/nairobi": {
    scene: "Nairobi is East Africa's technology centre — often called the Silicon Savannah — known for mobile-money innovation and as a regional base for the United Nations and many international organisations. Academic and technical writing is a long-established freelance field there, alongside software.",
    work: ["writing", "web", "data"],
  },
  "kenya/mombasa": {
    scene: "Mombasa is Kenya's main port and its coastal tourism centre. The freelance community is smaller than Nairobi's, which makes a precise, specialised profile the quickest way to be noticed.",
    work: ["support", "writing", "design"],
  },

  // ---------------------------------------------------------------- Ghana
  "ghana/accra": {
    scene: "Accra is Ghana's capital and its technology and services hub, on the same clock as London for half the year. That makes same-day collaboration with British clients easy, and American East Coast mornings fall in the Accra afternoon.",
    work: ["web", "support", "design"],
  },
  "ghana/kumasi": {
    scene: "Kumasi is Ghana's second city, a major trading centre and home to the country's leading science and technology university. Its engineering and computing graduates are a growing presence on freelance platforms.",
    work: ["engineering", "web", "design"],
  },

  // ---------------------------------------------------------------- Philippines
  "philippines/manila": {
    scene: "Manila is the heart of the Philippines' outsourcing industry, with decades of experience serving American companies. Filipino freelancers are known on Upwork for customer support and virtual assistance, and the way out of that category's price pressure is a profile built around one specialised process.",
    work: ["support", "finance", "design"],
  },
  "philippines/quezon-city": {
    scene: "Quezon City is the largest city in Metro Manila, home to the country's major broadcast networks and leading universities. Its talent spans media production and outsourcing, and creative freelancers there should show broadcast-quality samples.",
    work: ["video", "support", "writing"],
  },
  "philippines/cebu-city": {
    scene: "Cebu City is the Philippines' second outsourcing and technology hub, with a strong reputation in design and furniture-making and a large tourism economy. Developers and designers in Cebu often work directly for overseas clients.",
    work: ["web", "design", "support"],
  },
  "philippines/davao-city": {
    scene: "Davao City is the commercial centre of Mindanao, with an agribusiness base and a growing outsourcing sector. Freelancers there typically cover American hours overnight, which is exactly when a bidder matters most.",
    work: ["support", "sales", "marketing"],
  },

  // ---------------------------------------------------------------- Pakistan
  "pakistan/lahore": {
    scene: "Lahore has one of the largest concentrations of software houses and technology graduates in Pakistan, anchored by the Arfa Software Technology Park and several of the country's leading universities. With so many Lahore developers on Upwork, the profile that wins is the one that names a specialism instead of listing every framework.",
    work: ["web", "mobile", "design"],
  },
  "pakistan/karachi": {
    scene: "Karachi is Pakistan's financial and commercial capital and its main port, with banks, fintech startups, e-commerce companies and media houses based there. Its freelancers range from finance professionals to large development agencies, and each needs a different pitch.",
    work: ["ecommerce", "finance", "web"],
  },
  "pakistan/islamabad": {
    scene: "Islamabad is the capital, with a cluster of software exporters, telecom companies and strong engineering universities. Agencies there often serve overseas enterprise clients, and proposals that reflect that level of process win larger contracts.",
    work: ["cloud", "data", "enterprise"],
  },
  "pakistan/rawalpindi": {
    scene: "Rawalpindi is Islamabad's twin city and shares its talent pool, with a large community of independent freelancers and small agencies. Many work in the busiest Upwork categories, where the first few lines of the proposal decide whether it is read at all.",
    work: ["web", "marketing", "support"],
  },
  "pakistan/faisalabad": {
    scene: "Faisalabad is the centre of Pakistan's textile industry. Freelancers there often have first-hand knowledge of apparel, sourcing and export — useful background for e-commerce and product work, and rare enough to be worth stating.",
    work: ["ecommerce", "design", "marketing"],
  },
  "pakistan/multan": {
    scene: "Multan is the main city of southern Punjab, with an agricultural economy and a fast-growing freelance community, much of it self-taught or trained through public skills programmes. A sharp, specific profile matters most for freelancers who are still building a job history.",
    work: ["design", "marketing", "support"],
  },
  "pakistan/gujranwala": {
    scene: "Gujranwala is an industrial city of small and medium manufacturers. Its freelance scene is young, and newer freelancers there gain most from bidding on fewer, better-matched jobs rather than spreading Connects thinly.",
    work: ["design", "web", "support"],
  },
  "pakistan/sialkot": {
    scene: "Sialkot is one of Pakistan's great export cities, known around the world for sports goods, surgical instruments and leather products. Freelancers there understand export trade and product catalogues, a natural fit for e-commerce and marketplace work.",
    work: ["ecommerce", "sales", "design"],
  },
  "pakistan/peshawar": {
    scene: "Peshawar is the capital of Khyber Pakhtunkhwa, with established universities and a freelance community that has grown quickly with provincial technology initiatives. Developers and designers there compete in crowded categories, where a narrow specialism is the best defence.",
    work: ["web", "design", "writing"],
  },
  "pakistan/hyderabad": {
    scene: "Hyderabad is the second-largest city in Sindh, close to major engineering and general universities at Jamshoro. Its graduates are a steady source of new freelancers, who benefit from help turning coursework and early projects into a credible profile.",
    work: ["web", "engineering", "support"],
  },
  "pakistan/quetta": {
    scene: "Quetta is the capital of Balochistan, with a smaller but growing freelance community centred on its universities. Freelancers there are often early in their Upwork history, when choosing the right jobs to bid on matters more than volume.",
    work: ["design", "writing", "support"],
  },

  // ---------------------------------------------------------------- India
  "india/mumbai": {
    scene: "Mumbai is India's financial capital and the home of its film, television and advertising industries. Freelancers there are as likely to be finance professionals or creative producers as developers, and the profile should make clear which.",
    work: ["finance", "video", "marketing"],
  },
  "india/delhi": {
    scene: "Delhi and its surrounding region form one of India's largest markets for services, media and startups. Competition among agencies is intense, and on Upwork that shows up as many similar profiles bidding on the same jobs — which is where a targeted proposal earns its reply.",
    work: ["marketing", "web", "design"],
  },
  "india/bengaluru": {
    scene: "Bengaluru is India's technology capital, with a dense concentration of software companies, research centres and startups. Engineers there often have product-company experience, and should bid on depth rather than against the lowest hourly rate.",
    work: ["data", "cloud", "mobile"],
  },
  "india/hyderabad": {
    scene: "Hyderabad's HITEC City houses large campuses of global technology companies, and the city is also a centre of India's pharmaceutical industry. Developers with enterprise experience are plentiful, so the proposal has to show which platform and which scale.",
    work: ["enterprise", "cloud", "data"],
  },
  "india/chennai": {
    scene: "Chennai is a centre for software-as-a-service companies and for India's automotive industry, with a deep engineering talent base. Freelancers there are well placed for product engineering and for technical work that mixes software with manufacturing.",
    work: ["web", "engineering", "enterprise"],
  },
  "india/pune": {
    scene: "Pune combines information-technology services with automotive and manufacturing engineering and a large student population. Many Pune freelancers come from services companies and know how to deliver; what the profile has to add is a clear specialism.",
    work: ["web", "engineering", "cloud"],
  },
  "india/kolkata": {
    scene: "Kolkata is the commercial centre of eastern India, with an information-technology district at Salt Lake and a long tradition in publishing, design and the arts. Its web agencies and creative freelancers have been on global platforms for many years.",
    work: ["web", "design", "writing"],
  },
  "india/ahmedabad": {
    scene: "Ahmedabad is Gujarat's largest city, known for textiles, pharmaceuticals and an entrepreneurial trading culture. It has a large number of small web and mobile agencies, many of which rely on Upwork as their main source of overseas clients.",
    work: ["mobile", "web", "ecommerce"],
  },
  "india/surat": {
    scene: "Surat is the centre of the world's diamond-cutting trade and of India's synthetic-textile industry. Its growing community of developers and designers often has a commercial, trade-minded outlook that suits e-commerce clients.",
    work: ["ecommerce", "mobile", "design"],
  },
  "india/jaipur": {
    scene: "Jaipur is known for jewellery, handicrafts and tourism, and has built a visible startup and information-technology scene. Design and e-commerce freelancers there can draw on a strong local craft and export tradition.",
    work: ["design", "ecommerce", "web"],
  },
  "india/noida": {
    scene: "Noida, in the Delhi region, hosts information-technology services companies, media houses and electronics manufacturers. It has a dense population of web and app agencies, which makes differentiation on Upwork the central problem.",
    work: ["web", "enterprise", "mobile"],
  },
  "india/lucknow": {
    scene: "Lucknow is the capital of Uttar Pradesh, with a growing information-technology sector and a large pool of graduates. Freelancers there are often building their first overseas client base, when proposal quality matters far more than proposal count.",
    work: ["web", "writing", "support"],
  },
  "india/gurugram": {
    scene: "Gurugram is a corporate city of multinational offices, consulting firms and well-funded startups. Professionals there bring consulting and finance backgrounds to Upwork, and should present as specialists serving businesses, not as general freelancers.",
    work: ["finance", "sales", "data"],
  },
  "india/chandigarh": {
    scene: "Chandigarh, together with neighbouring Mohali and Panchkula, has an unusually high number of web and mobile development agencies for its size, many of them built almost entirely on overseas freelance platforms. Standing apart from a neighbour with the same skills is the whole game.",
    work: ["web", "mobile", "marketing"],
  },
  "india/indore": {
    scene: "Indore is the commercial capital of Madhya Pradesh and home to both an Indian Institute of Technology and an Indian Institute of Management. Its technology sector is growing fast, with many small agencies seeking overseas work.",
    work: ["web", "mobile", "design"],
  },
  "india/kochi": {
    scene: "Kochi is Kerala's commercial centre and port, with technology parks and an active state-backed startup community. Kerala also has a large diaspora in the Gulf, and Kochi freelancers frequently serve clients in the Middle East as well as the West.",
    work: ["web", "cloud", "mobile"],
  },

  // ---------------------------------------------------------------- Bangladesh
  "bangladesh/dhaka": {
    scene: "Dhaka is the centre of Bangladesh's software and freelance industries and the headquarters of its garment export trade. The city has an enormous number of designers, developers and marketers on Upwork, so a profile that looks like the next one is the main risk.",
    work: ["design", "web", "marketing"],
  },
  "bangladesh/chattogram": {
    scene: "Chattogram is Bangladesh's principal port and second city, with an economy built on trade, shipping and industry. Its freelance community is growing, and specialists with trade or logistics knowledge have a ready-made niche.",
    work: ["ecommerce", "web", "support"],
  },
  "bangladesh/sylhet": {
    scene: "Sylhet has close family and business ties to the United Kingdom through its large diaspora. Freelancers there often find British clients a natural first market, and UK working hours fall conveniently in the Sylhet afternoon and evening.",
    work: ["marketing", "design", "support"],
  },
  "bangladesh/khulna": {
    scene: "Khulna is the main city of south-western Bangladesh, with an engineering university and a growing community of freelancers. Many are early in their Upwork history, when choosing which jobs to bid on is the most valuable decision they make.",
    work: ["engineering", "web", "design"],
  },
  "bangladesh/rajshahi": {
    scene: "Rajshahi is known as an education city, with a major public university and an engineering university. Its students and graduates are a steady source of new freelancers, for whom a well-built profile is the difference between waiting and working.",
    work: ["design", "writing", "support"],
  },
};

export const cityNote = (countrySlug: string, citySlug: string): CityNote | undefined => CITY_NOTES[`${countrySlug}/${citySlug}`];
