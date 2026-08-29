/**
 * Real Estate Analysis — PadSplit-style co-living investment framework.
 * Target markets: Rhode Island + Southern Massachusetts.
 *
 * Data sources:
 *  - Zillow via RapidAPI (zillow-com1.p.rapidapi.com) — live listings
 *  - HUD Fair Market Rents API (free, no key) — room rate benchmarks
 *  - Sample dataset — full analysis without API key
 */

import type { PropertyListing, PadSplitAnalysis, RESignal } from '../types';

// ─── Market definitions ───────────────────────────────────────────────────────

export interface MarketConfig {
  name: string;
  state: string;
  zip: string;
  hudFmrArea: string;       // HUD FMR area label for benchmark
  medianPrice: number;      // approximate current median SFH price
  roomRateMin: number;      // $ / room / month (PadSplit-comparable)
  roomRateMax: number;
  traditionalRentPerBed: number;  // traditional $ / bedroom / month
  propertyTaxRate: number;  // annual % of assessed value
}

export const RE_MARKETS: MarketConfig[] = [
  { name: 'Providence',    state: 'RI', zip: '02907', hudFmrArea: 'Providence-Warwick', medianPrice: 320_000, roomRateMin: 750, roomRateMax: 900, traditionalRentPerBed: 700, propertyTaxRate: 0.019 },
  { name: 'Pawtucket',     state: 'RI', zip: '02860', hudFmrArea: 'Providence-Warwick', medianPrice: 270_000, roomRateMin: 700, roomRateMax: 850, traditionalRentPerBed: 650, propertyTaxRate: 0.020 },
  { name: 'Woonsocket',    state: 'RI', zip: '02895', hudFmrArea: 'Providence-Warwick', medianPrice: 210_000, roomRateMin: 675, roomRateMax: 800, traditionalRentPerBed: 625, propertyTaxRate: 0.021 },
  { name: 'Cranston',      state: 'RI', zip: '02910', hudFmrArea: 'Providence-Warwick', medianPrice: 340_000, roomRateMin: 775, roomRateMax: 925, traditionalRentPerBed: 725, propertyTaxRate: 0.018 },
  { name: 'Central Falls', state: 'RI', zip: '02863', hudFmrArea: 'Providence-Warwick', medianPrice: 195_000, roomRateMin: 650, roomRateMax: 775, traditionalRentPerBed: 600, propertyTaxRate: 0.022 },
  { name: 'Fall River',    state: 'MA', zip: '02720', hudFmrArea: 'New Bedford',        medianPrice: 260_000, roomRateMin: 725, roomRateMax: 875, traditionalRentPerBed: 675, propertyTaxRate: 0.013 },
  { name: 'New Bedford',   state: 'MA', zip: '02740', hudFmrArea: 'New Bedford',        medianPrice: 250_000, roomRateMin: 725, roomRateMax: 875, traditionalRentPerBed: 675, propertyTaxRate: 0.014 },
  { name: 'Brockton',      state: 'MA', zip: '02301', hudFmrArea: 'Brockton',           medianPrice: 340_000, roomRateMin: 800, roomRateMax: 950, traditionalRentPerBed: 750, propertyTaxRate: 0.015 },
  { name: 'Attleboro',     state: 'MA', zip: '02703', hudFmrArea: 'Providence-Warwick', medianPrice: 340_000, roomRateMin: 800, roomRateMax: 950, traditionalRentPerBed: 750, propertyTaxRate: 0.013 },
  { name: 'Taunton',       state: 'MA', zip: '02780', hudFmrArea: 'Brockton',           medianPrice: 330_000, roomRateMin: 775, roomRateMax: 925, traditionalRentPerBed: 725, propertyTaxRate: 0.014 },
];

// ─── PadSplit analysis engine ─────────────────────────────────────────────────

const INTEREST_RATE = 0.075;   // 30-yr fixed, current market estimate
const DOWN_PCT      = 0.25;    // 25% down payment assumption
const LOAN_TERM_YRS = 30;

/** Renovation cost per bedroom to set up co-living room (lock, paint, basic furniture) */
function estimateRenovation(property: PropertyListing): number {
  const { bedrooms, sqft, yearBuilt } = property;
  const ageFactor = (yearBuilt && yearBuilt < 1970) ? 1.4 : (yearBuilt && yearBuilt < 1990) ? 1.2 : 1.0;
  const perRoom   = 3_500 * ageFactor;
  const bathExtra = bedrooms >= 4 ? 5_000 : 0;   // likely need at least one more bath
  const commonArea = 3_000;
  const sqftExtra  = sqft < 1_200 ? 2_000 : 0;   // small houses need layout work
  return Math.round((perRoom * bedrooms + bathExtra + commonArea + sqftExtra) * 1.1);
}

/** Monthly mortgage payment */
function calcMortgage(principal: number): number {
  const r  = INTEREST_RATE / 12;
  const n  = LOAN_TERM_YRS * 12;
  return Math.round(principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
}

/** Full PadSplit-style investment analysis for one property */
export function analyzePadSplit(
  property: PropertyListing,
  market: MarketConfig,
): PadSplitAnalysis {
  const { price, bedrooms, sqft, distressType } = property;

  // Rooms available for co-living (all bedrooms)
  const estimatedRooms = Math.max(1, bedrooms);
  const revenuePerRoom = Math.round((market.roomRateMin + market.roomRateMax) / 2);
  const grossMonthlyRev = estimatedRooms * revenuePerRoom;
  const grossAnnualRev  = grossMonthlyRev * 12;

  // Traditional rental comparison
  const traditionalRent  = bedrooms * market.traditionalRentPerBed;
  const revenueUplift    = traditionalRent > 0
    ? ((grossMonthlyRev - traditionalRent) / traditionalRent) * 100
    : 0;

  // Renovation
  const renovationCost  = estimateRenovation(property);
  const totalInvestment = price + renovationCost;

  // PadSplit-specific expense model:
  //   Platform fee: 19% | Utilities (landlord): 18% | Vacancy buffer: 7%
  //   Insurance: 4% | Taxes: variable | Maintenance: 6%
  const annualTaxes       = price * market.propertyTaxRate;
  const platformFeePct    = 0.19;
  const utilitiesPct      = 0.18;   // landlord pays all utilities
  const vacancyFactor     = 0.07;
  const insurancePct      = 0.04;
  const maintenancePct    = 0.06;
  const expenseRatio      = platformFeePct + utilitiesPct + vacancyFactor + insurancePct + maintenancePct;
  const annualExpenses    = grossAnnualRev * expenseRatio + annualTaxes;
  const noi               = grossAnnualRev - annualExpenses;
  const capRate           = totalInvestment > 0 ? (noi / totalInvestment) * 100 : 0;

  // Financing
  const downPayment      = Math.round(price * DOWN_PCT);
  const loanAmount       = price - downPayment;
  const monthlyDebtSvc   = calcMortgage(loanAmount);
  const annualDebtSvc    = monthlyDebtSvc * 12;
  const monthlyCashFlow  = Math.round(noi / 12 - monthlyDebtSvc);
  const annualCashFlow   = monthlyCashFlow * 12;
  const totalCashIn      = downPayment + renovationCost;
  const cocReturn        = totalCashIn > 0 ? (annualCashFlow / totalCashIn) * 100 : 0;
  const dscr             = annualDebtSvc > 0 ? noi / annualDebtSvc : 0;

  // ── PadSplit compatibility score ──────────────────────────────────────────
  let score = 0;
  const flags: string[] = [];

  // Bedrooms (core requirement)
  if (bedrooms >= 5) { score += 25; flags.push('✅ 5+ bedrooms — ideal co-living configuration'); }
  else if (bedrooms === 4) { score += 20; flags.push('✅ 4 bedrooms — solid co-living configuration'); }
  else if (bedrooms === 3) { score += 10; flags.push('⚠️ 3 bedrooms — minimum viable, lower revenue ceiling'); }
  else { score -= 10; flags.push('❌ Under 3 bedrooms — not recommended for PadSplit'); }

  // Square footage
  const sqftPerRoom = bedrooms > 0 ? sqft / bedrooms : 0;
  if (sqftPerRoom >= 300) { score += 15; flags.push(`✅ ${sqftPerRoom.toFixed(0)} sqft/room — comfortable for tenants`); }
  else if (sqftPerRoom >= 220) { score += 8; flags.push(`⚠️ ${sqftPerRoom.toFixed(0)} sqft/room — acceptable but tight`); }
  else { score -= 5; flags.push(`❌ ${sqftPerRoom.toFixed(0)} sqft/room — cramped, may fail PadSplit inspection`); }

  // Financial returns
  if (capRate >= 10) { score += 20; flags.push(`✅ Cap rate ${capRate.toFixed(1)}% — excellent return`); }
  else if (capRate >= 7) { score += 12; flags.push(`✅ Cap rate ${capRate.toFixed(1)}% — solid return`); }
  else if (capRate >= 5) { score += 5; flags.push(`⚠️ Cap rate ${capRate.toFixed(1)}% — marginal; needs below-ask price or lower renovation`); }
  else { score -= 5; flags.push(`❌ Cap rate ${capRate.toFixed(1)}% — sub-optimal at this price`); }

  if (dscr >= 1.25) { score += 15; flags.push(`✅ DSCR ${dscr.toFixed(2)} — lender-friendly, cash-flow positive`); }
  else if (dscr >= 1.0) { score += 8; flags.push(`⚠️ DSCR ${dscr.toFixed(2)} — breakeven; tight on lender requirements`); }
  else { score -= 10; flags.push(`❌ DSCR ${dscr.toFixed(2)} — negative cash flow at current price`); }

  if (cocReturn >= 12) { score += 15; flags.push(`✅ ${cocReturn.toFixed(1)}% CoC return — strong equity deployment`); }
  else if (cocReturn >= 8) { score += 8; flags.push(`✅ ${cocReturn.toFixed(1)}% CoC return — above typical benchmark`); }
  else if (cocReturn >= 5) { score += 3; flags.push(`⚠️ ${cocReturn.toFixed(1)}% CoC return — below 8% target`); }
  else { score -= 5; flags.push(`❌ ${cocReturn.toFixed(1)}% CoC return — poor capital efficiency`); }

  // Distress discount bonus
  if (distressType === 'bankruptcy' || distressType === 'foreclosure' || distressType === 'reo') {
    score += 10;
    flags.push(`✅ Distressed listing (${distressType}) — potential below-market acquisition`);
  } else if (distressType === 'pre_foreclosure' || distressType === 'auction') {
    score += 6;
    flags.push(`✅ ${distressType} — motivated seller, negotiate aggressively`);
  }

  // Revenue uplift vs traditional
  if (revenueUplift >= 40) { score += 5; flags.push(`✅ ${revenueUplift.toFixed(0)}% revenue uplift vs traditional rental`); }

  const clampedScore = Math.max(0, Math.min(100, score));

  const signal: RESignal =
    clampedScore >= 75 ? 'STRONG_BUY'
    : clampedScore >= 55 ? 'BUY'
    : clampedScore >= 38 ? 'WATCH'
    : clampedScore >= 20 ? 'HOLD'
    : 'PASS';

  return {
    estimatedRooms, revenuePerRoom, grossMonthlyRev, grossAnnualRev,
    traditionalRent, revenueUplift,
    renovationCost, totalInvestment,
    vacancyFactor, expenseRatio, annualExpenses, noi, capRate,
    downPayment, loanAmount, monthlyDebtSvc, monthlyCashFlow, annualCashFlow,
    cocReturn, dscr,
    padSplitScore: clampedScore,
    padSplitFlags: flags,
    signal,
  };
}

// ─── Sample dataset (RI + Southern MA, works without API key) ─────────────────

export const SAMPLE_PROPERTIES: PropertyListing[] = [
  { id: 's1',  address: '142 Broad St',       city: 'Providence',    state: 'RI', zip: '02907', price: 289_000, bedrooms: 4, bathrooms: 2, sqft: 1_620, yearBuilt: 1940, propertyType: 'single_family', distressType: null,          daysOnMarket: 12, source: 'sample', description: 'Classic colonial, needs cosmetic updates' },
  { id: 's2',  address: '67 Park Ave',         city: 'Pawtucket',     state: 'RI', zip: '02860', price: 235_000, bedrooms: 5, bathrooms: 2, sqft: 1_980, yearBuilt: 1952, propertyType: 'single_family', distressType: null,          daysOnMarket: 8,  source: 'sample', description: 'Large cape cod, extra bedroom in attic' },
  { id: 's3',  address: '318 Hamlet Ave',      city: 'Woonsocket',    state: 'RI', zip: '02895', price: 168_500, bedrooms: 4, bathrooms: 1, sqft: 1_480, yearBuilt: 1935, propertyType: 'single_family', distressType: 'foreclosure', daysOnMarket: 45, source: 'sample', description: 'Bank-owned, sold as-is — significant deferred maintenance' },
  { id: 's4',  address: '212 Dexter St',       city: 'Central Falls', state: 'RI', zip: '02863', price: 148_000, bedrooms: 4, bathrooms: 2, sqft: 1_350, yearBuilt: 1928, propertyType: 'single_family', distressType: 'bankruptcy',  daysOnMarket: 62, source: 'sample', description: 'Chapter 7 estate sale — court approval required' },
  { id: 's5',  address: '55 Oak Grove Ave',    city: 'Cranston',      state: 'RI', zip: '02910', price: 315_000, bedrooms: 5, bathrooms: 2, sqft: 2_240, yearBuilt: 1962, propertyType: 'single_family', distressType: null,          daysOnMarket: 5,  source: 'sample', description: 'Ranch-style, fully intact, large lot' },
  { id: 's6',  address: '890 North Main St',   city: 'Fall River',    state: 'MA', zip: '02720', price: 249_000, bedrooms: 4, bathrooms: 2, sqft: 1_740, yearBuilt: 1948, propertyType: 'multi_family',  distressType: null,          daysOnMarket: 17, source: 'sample', description: '2-unit building, live in one unit and convert the other' },
  { id: 's7',  address: '33 Acushnet Ave',     city: 'New Bedford',   state: 'MA', zip: '02740', price: 218_000, bedrooms: 4, bathrooms: 1, sqft: 1_560, yearBuilt: 1944, propertyType: 'single_family', distressType: 'pre_foreclosure', daysOnMarket: 38, source: 'sample', description: 'Pre-foreclosure — owner motivated, contact before auction' },
  { id: 's8',  address: '175 Warren Ave',      city: 'Brockton',      state: 'MA', zip: '02301', price: 318_000, bedrooms: 4, bathrooms: 2, sqft: 1_820, yearBuilt: 1958, propertyType: 'single_family', distressType: null,          daysOnMarket: 9,  source: 'sample', description: 'Recently updated kitchen and baths' },
  { id: 's9',  address: '412 County St',       city: 'Attleboro',     state: 'MA', zip: '02703', price: 289_000, bedrooms: 3, bathrooms: 1, sqft: 1_240, yearBuilt: 1965, propertyType: 'single_family', distressType: null,          daysOnMarket: 22, source: 'sample', description: '3-bed cape, attic could add 4th bedroom' },
  { id: 's10', address: '88 Broadway',         city: 'Taunton',       state: 'MA', zip: '02780', price: 275_000, bedrooms: 5, bathrooms: 3, sqft: 2_100, yearBuilt: 1968, propertyType: 'single_family', distressType: 'reo',         daysOnMarket: 31, source: 'sample', description: 'HUD REO — FHA financing eligible, needs basic rehab' },
  { id: 's11', address: '29 Lippitt St',       city: 'Providence',    state: 'RI', zip: '02909', price: 195_000, bedrooms: 4, bathrooms: 2, sqft: 1_510, yearBuilt: 1930, propertyType: 'single_family', distressType: 'auction',     daysOnMarket: 0,  source: 'sample', description: 'Going to auction — estimated starting bid $175K' },
  { id: 's12', address: '566 Newport Ave',     city: 'Pawtucket',     state: 'RI', zip: '02861', price: 258_000, bedrooms: 5, bathrooms: 2, sqft: 2_050, yearBuilt: 1955, propertyType: 'single_family', distressType: null,          daysOnMarket: 14, source: 'sample', description: '5-bed colonial, updated electrical, newer roof' },
];

// ─── City demographic + crime data ───────────────────────────────────────────
// Sources: US Census ACS 2022 5-Year Estimates · FBI UCR 2022 · RI/MA state crime reports

export interface CityStats {
  population:             number;
  medianHhIncome:         number;   // USD
  medianAge:              number;
  renterPct:              number;   // % renter-occupied units — high = strong PadSplit demand
  povertyPct:             number;   // % below poverty line
  violentCrimePer100k:    number;   // FBI UCR violent crime rate
  propertyCrimePer100k:   number;   // FBI UCR property crime rate
  crimeGrade:             'A' | 'B' | 'C' | 'D' | 'F';
  dataSource:             string;
  cityDataUrl:            string;   // city-data.com full profile
  areaVibsUrl:            string;   // areavibes.com livability + crime
  crimeGradeUrl:          string;   // crimegrade.org detail
}

export const CITY_STATS: Record<string, CityStats> = {
  'Providence': {
    population: 191_400, medianHhIncome: 48_200, medianAge: 29.5, renterPct: 62, povertyPct: 25,
    violentCrimePer100k: 780, propertyCrimePer100k: 2_800, crimeGrade: 'D',
    dataSource: 'US Census ACS 2022 · FBI UCR 2022',
    cityDataUrl:   'https://www.city-data.com/city/Providence-Rhode-Island.html',
    areaVibsUrl:   'https://www.areavibes.com/providence-ri/',
    crimeGradeUrl: 'https://crimegrade.org/safest-places-in-providence-ri/',
  },
  'Pawtucket': {
    population: 75_800, medianHhIncome: 45_600, medianAge: 35, renterPct: 55, povertyPct: 22,
    violentCrimePer100k: 500, propertyCrimePer100k: 2_200, crimeGrade: 'C',
    dataSource: 'US Census ACS 2022 · FBI UCR 2022',
    cityDataUrl:   'https://www.city-data.com/city/Pawtucket-Rhode-Island.html',
    areaVibsUrl:   'https://www.areavibes.com/pawtucket-ri/',
    crimeGradeUrl: 'https://crimegrade.org/safest-places-in-pawtucket-ri/',
  },
  'Woonsocket': {
    population: 43_400, medianHhIncome: 41_800, medianAge: 36, renterPct: 52, povertyPct: 24,
    violentCrimePer100k: 680, propertyCrimePer100k: 2_400, crimeGrade: 'D',
    dataSource: 'US Census ACS 2022 · FBI UCR 2022',
    cityDataUrl:   'https://www.city-data.com/city/Woonsocket-Rhode-Island.html',
    areaVibsUrl:   'https://www.areavibes.com/woonsocket-ri/',
    crimeGradeUrl: 'https://crimegrade.org/safest-places-in-woonsocket-ri/',
  },
  'Cranston': {
    population: 83_900, medianHhIncome: 72_400, medianAge: 38, renterPct: 35, povertyPct: 10,
    violentCrimePer100k: 180, propertyCrimePer100k: 1_200, crimeGrade: 'B',
    dataSource: 'US Census ACS 2022 · FBI UCR 2022',
    cityDataUrl:   'https://www.city-data.com/city/Cranston-Rhode-Island.html',
    areaVibsUrl:   'https://www.areavibes.com/cranston-ri/',
    crimeGradeUrl: 'https://crimegrade.org/safest-places-in-cranston-ri/',
  },
  'Central Falls': {
    population: 22_300, medianHhIncome: 37_200, medianAge: 30, renterPct: 75, povertyPct: 32,
    violentCrimePer100k: 1_100, propertyCrimePer100k: 3_200, crimeGrade: 'F',
    dataSource: 'US Census ACS 2022 · FBI UCR 2022',
    cityDataUrl:   'https://www.city-data.com/city/Central-Falls-Rhode-Island.html',
    areaVibsUrl:   'https://www.areavibes.com/central-falls-ri/',
    crimeGradeUrl: 'https://crimegrade.org/safest-places-in-central-falls-ri/',
  },
  'Fall River': {
    population: 91_400, medianHhIncome: 44_100, medianAge: 37, renterPct: 52, povertyPct: 22,
    violentCrimePer100k: 550, propertyCrimePer100k: 1_900, crimeGrade: 'C',
    dataSource: 'US Census ACS 2022 · FBI UCR 2022',
    cityDataUrl:   'https://www.city-data.com/city/Fall-River-Massachusetts.html',
    areaVibsUrl:   'https://www.areavibes.com/fall-river-ma/',
    crimeGradeUrl: 'https://crimegrade.org/safest-places-in-fall-river-ma/',
  },
  'New Bedford': {
    population: 101_700, medianHhIncome: 45_800, medianAge: 37, renterPct: 53, povertyPct: 21,
    violentCrimePer100k: 620, propertyCrimePer100k: 2_100, crimeGrade: 'D',
    dataSource: 'US Census ACS 2022 · FBI UCR 2022',
    cityDataUrl:   'https://www.city-data.com/city/New-Bedford-Massachusetts.html',
    areaVibsUrl:   'https://www.areavibes.com/new-bedford-ma/',
    crimeGradeUrl: 'https://crimegrade.org/safest-places-in-new-bedford-ma/',
  },
  'Brockton': {
    population: 106_500, medianHhIncome: 56_300, medianAge: 36, renterPct: 48, povertyPct: 16,
    violentCrimePer100k: 700, propertyCrimePer100k: 2_300, crimeGrade: 'D',
    dataSource: 'US Census ACS 2022 · FBI UCR 2022',
    cityDataUrl:   'https://www.city-data.com/city/Brockton-Massachusetts.html',
    areaVibsUrl:   'https://www.areavibes.com/brockton-ma/',
    crimeGradeUrl: 'https://crimegrade.org/safest-places-in-brockton-ma/',
  },
  'Attleboro': {
    population: 48_200, medianHhIncome: 73_200, medianAge: 38, renterPct: 32, povertyPct: 9,
    violentCrimePer100k: 150, propertyCrimePer100k: 1_100, crimeGrade: 'A',
    dataSource: 'US Census ACS 2022 · FBI UCR 2022',
    cityDataUrl:   'https://www.city-data.com/city/Attleboro-Massachusetts.html',
    areaVibsUrl:   'https://www.areavibes.com/attleboro-ma/',
    crimeGradeUrl: 'https://crimegrade.org/safest-places-in-attleboro-ma/',
  },
  'Taunton': {
    population: 57_900, medianHhIncome: 65_800, medianAge: 38, renterPct: 39, povertyPct: 12,
    violentCrimePer100k: 250, propertyCrimePer100k: 1_400, crimeGrade: 'B',
    dataSource: 'US Census ACS 2022 · FBI UCR 2022',
    cityDataUrl:   'https://www.city-data.com/city/Taunton-Massachusetts.html',
    areaVibsUrl:   'https://www.areavibes.com/taunton-ma/',
    crimeGradeUrl: 'https://crimegrade.org/safest-places-in-taunton-ma/',
  },
};

/** Generate a Zillow address-search URL for any property */
export function getListingUrl(property: PropertyListing): string {
  if (property.listingUrl) return property.listingUrl;
  const q = encodeURIComponent(`${property.address}, ${property.city}, ${property.state} ${property.zip}`);
  return `https://www.zillow.com/homes/${q}_rb/`;
}

/** Generate a Google Maps URL for the property address */
export function getMapUrl(property: PropertyListing): string {
  const q = encodeURIComponent(`${property.address}, ${property.city}, ${property.state} ${property.zip}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

// ─── Distressed property resource links ───────────────────────────────────────

export const DISTRESSED_RESOURCES = [
  { name: 'HUD Homes (REO)',     url: 'https://www.hudhomestore.gov/Home/Index.aspx', desc: 'FHA-foreclosed properties — often FHA 203(k) eligible' },
  { name: 'Fannie Mae HomePath', url: 'https://www.homepath.com/',                   desc: 'Fannie Mae REO — 3% down financing available' },
  { name: 'Freddie Mac HomeSteps', url: 'https://www.homesteps.com/',                desc: 'Freddie Mac REO — no appraisal required for owner-occupants' },
  { name: 'Auction.com',         url: 'https://www.auction.com/residential/ri-ma',   desc: 'Foreclosure & bank-owned auctions' },
  { name: 'Hubzu',               url: 'https://www.hubzu.com/search/ri',             desc: 'Online real estate auctions' },
  { name: 'PACER (Bankruptcy)',  url: 'https://pacer.uscourts.gov/',                 desc: 'Federal bankruptcy filings — find properties in Chapter 7/13' },
  { name: 'RI Judiciary',       url: 'https://courtconnect.courts.ri.gov/',          desc: 'RI court records — foreclosure filings' },
  { name: 'MA Land Court',      url: 'https://www.mass.gov/orgs/land-court',         desc: 'MA foreclosure filings and tax lien properties' },
];

// ─── Helper to match property to market config ────────────────────────────────

export function getMarketConfig(city: string, state: string): MarketConfig {
  const found = RE_MARKETS.find(
    m => m.name.toLowerCase() === city.toLowerCase() && m.state === state
  );
  // Fallback: find by state
  const stateFallback = RE_MARKETS.find(m => m.state === state);
  return found ?? stateFallback ?? RE_MARKETS[0];
}
