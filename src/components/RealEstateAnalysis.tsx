/**
 * Real Estate Analysis — PadSplit-style co-living investment scanner
 * for Rhode Island + Southern Massachusetts markets.
 */

import { useState, useMemo } from 'react';
import {
  Home, Building2, Search, AlertTriangle, PlusCircle, X,
  DollarSign, BarChart2, ExternalLink, ChevronDown, ChevronUp,
  MapPin, Calendar, Ruler, Building, Users, ShieldAlert, Map,
} from 'lucide-react';
import { useInvestmentStore } from '../store/investmentStore';
import { useToast } from './Toast';
import {
  RE_MARKETS, SAMPLE_PROPERTIES, DISTRESSED_RESOURCES,
  CITY_STATS, analyzePadSplit, getMarketConfig,
  getListingUrl, getMapUrl,
} from '../lib/realEstate';
import type { PropertyListing, PadSplitAnalysis, RESignal, PropertyType, DistressType } from '../types';

// ─── Signal config ────────────────────────────────────────────────────────────

const SIG_CFG: Record<RESignal, { label: string; cls: string; rowCls: string }> = {
  STRONG_BUY: { label: 'Strong Buy', cls: 'bg-emerald-800 text-emerald-200 border-emerald-600',     rowCls: 'border-l-2 border-emerald-600 bg-emerald-950/30' },
  BUY:        { label: 'Buy',        cls: 'bg-green-900 text-green-300 border-green-700',            rowCls: 'bg-green-950/20' },
  WATCH:      { label: 'Watch',      cls: 'bg-indigo-900 text-indigo-300 border-indigo-700',         rowCls: 'bg-indigo-950/20' },
  HOLD:       { label: 'Hold',       cls: 'bg-gray-800 text-gray-400 border-gray-600',               rowCls: '' },
  PASS:       { label: 'Pass',       cls: 'bg-red-950 text-red-400 border-red-800',                  rowCls: 'bg-red-950/10' },
};

const DISTRESS_CFG: Record<string, { label: string; cls: string }> = {
  foreclosure:     { label: 'Foreclosure',     cls: 'bg-red-950/50 text-red-300 border-red-800' },
  pre_foreclosure: { label: 'Pre-Foreclosure', cls: 'bg-orange-950/50 text-orange-300 border-orange-800' },
  bankruptcy:      { label: 'Bankruptcy',      cls: 'bg-purple-950/50 text-purple-300 border-purple-800' },
  reo:             { label: 'REO',             cls: 'bg-amber-950/50 text-amber-300 border-amber-800' },
  auction:         { label: 'Auction',         cls: 'bg-yellow-950/50 text-yellow-300 border-yellow-800' },
};

function fmt$(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtPct(v: number) { return `${v >= 0 ? '' : ''}${v.toFixed(1)}%`; }

// ─── Property analysis card (expanded) ───────────────────────────────────────

function PropertyDetail({ property, analysis }: { property: PropertyListing; analysis: PadSplitAnalysis }) {
  const market = getMarketConfig(property.city, property.state);

  return (
    <div className="border-t border-gray-800 bg-gray-950/60 px-5 py-5 space-y-5">

      {/* Revenue comparison */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Rooms',              val: `${analysis.estimatedRooms} rooms`,                    sub: `${fmt$(analysis.revenuePerRoom)}/room/mo`,       cls: 'text-white' },
          { label: 'Gross Revenue',      val: fmt$(analysis.grossMonthlyRev) + '/mo',                sub: `${fmt$(analysis.grossAnnualRev)}/yr`,             cls: 'text-emerald-300' },
          { label: 'vs Traditional',     val: `+${analysis.revenueUplift.toFixed(0)}% uplift`,       sub: `Traditional: ${fmt$(analysis.traditionalRent)}/mo`, cls: analysis.revenueUplift >= 30 ? 'text-emerald-400' : 'text-yellow-400' },
          { label: 'Total Investment',   val: fmt$(analysis.totalInvestment),                        sub: `Reno est: ${fmt$(analysis.renovationCost)}`,      cls: 'text-gray-300' },
        ].map(({ label, val, sub, cls }) => (
          <div key={label} className="bg-gray-900/60 border border-gray-800 rounded-xl p-3">
            <div className="text-xs text-gray-500 mb-1">{label}</div>
            <div className={`font-bold text-sm ${cls}`}>{val}</div>
            <div className="text-[11px] text-gray-600 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Investment metrics */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-semibold">Investment Metrics</p>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center">
          {[
            { label: 'Cap Rate',  val: fmtPct(analysis.capRate),          good: analysis.capRate >= 7,   warn: analysis.capRate >= 5 },
            { label: 'CoC Return', val: fmtPct(analysis.cocReturn),        good: analysis.cocReturn >= 8, warn: analysis.cocReturn >= 5 },
            { label: 'DSCR',      val: analysis.dscr.toFixed(2),           good: analysis.dscr >= 1.25,   warn: analysis.dscr >= 1.0 },
            { label: 'NOI/yr',    val: fmt$(analysis.noi),                  good: analysis.noi > 0,        warn: false },
            { label: 'Monthly CF', val: (analysis.monthlyCashFlow >= 0 ? '+' : '') + fmt$(analysis.monthlyCashFlow), good: analysis.monthlyCashFlow >= 200, warn: analysis.monthlyCashFlow >= 0 },
            { label: 'Expense %',  val: fmtPct(analysis.expenseRatio * 100), good: false, warn: true },
          ].map(({ label, val, good, warn }) => (
            <div key={label} className={`rounded-lg p-2.5 ${good ? 'bg-emerald-950/30' : warn ? 'bg-yellow-950/20' : 'bg-gray-800/50'}`}>
              <div className="text-[10px] text-gray-500">{label}</div>
              <div className={`text-sm font-bold ${good ? 'text-emerald-300' : warn ? 'text-yellow-400' : 'text-gray-400'}`}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Financing breakdown */}
      <div className="bg-gray-900/50 border border-gray-700/50 rounded-xl p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-3 font-semibold">Financing Breakdown (25% down · 7.5% 30-yr)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><div className="text-gray-500 text-xs">Down Payment</div><div className="text-white font-semibold">{fmt$(analysis.downPayment)}</div></div>
          <div><div className="text-gray-500 text-xs">Loan Amount</div><div className="text-white font-semibold">{fmt$(analysis.loanAmount)}</div></div>
          <div><div className="text-gray-500 text-xs">Monthly Mortgage</div><div className="text-red-400 font-semibold">-{fmt$(analysis.monthlyDebtSvc)}</div></div>
          <div><div className="text-gray-500 text-xs">Total Cash In</div><div className="text-gray-300 font-semibold">{fmt$(analysis.downPayment + analysis.renovationCost)}</div></div>
        </div>
        <div className="mt-3 text-xs text-gray-600">
          Scenario: {fmt$(analysis.grossMonthlyRev)} gross − {fmt$(Math.round(analysis.annualExpenses / 12))} expenses − {fmt$(analysis.monthlyDebtSvc)} mortgage
          = <strong className={analysis.monthlyCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {analysis.monthlyCashFlow >= 0 ? '+' : ''}{fmt$(analysis.monthlyCashFlow)}/mo
            </strong>
        </div>
      </div>

      {/* PadSplit checklist */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-semibold">
          PadSplit Compatibility — {analysis.padSplitScore}/100
        </p>
        <div className="w-full bg-gray-800 rounded-full h-2 mb-3">
          <div
            className={`h-2 rounded-full ${analysis.padSplitScore >= 70 ? 'bg-emerald-500' : analysis.padSplitScore >= 45 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${analysis.padSplitScore}%` }}
          />
        </div>
        <ul className="space-y-1.5">
          {analysis.padSplitFlags.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-gray-300 bg-gray-900/40 rounded-lg px-3 py-2">
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Market context */}
      <div className="text-xs bg-gray-800/40 border border-gray-700/40 rounded-lg px-3 py-2.5 space-y-1">
        <p className="text-gray-400 font-semibold">{property.city} market: {market.name}, {market.state}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-500">
          <span>Room rate range: {fmt$(market.roomRateMin)}–{fmt$(market.roomRateMax)}/mo</span>
          <span>Median price: {fmt$(market.medianPrice)}</span>
          <span>Property tax rate: {(market.propertyTaxRate * 100).toFixed(1)}%</span>
        </div>
        <p className="text-gray-600 pt-0.5">
          PadSplit platform fee: 19% · Landlord covers utilities · Vacancy buffer: 7%
        </p>
      </div>

      {/* ── Town Profile: demographics + crime ── */}
      {(() => {
        const stats = CITY_STATS[property.city];
        if (!stats) return null;

        const gradeColor: Record<string, string> = {
          A: 'text-emerald-300 bg-emerald-950/40 border-emerald-700',
          B: 'text-green-300 bg-green-950/30 border-green-800',
          C: 'text-yellow-300 bg-yellow-950/30 border-yellow-800',
          D: 'text-orange-300 bg-orange-950/30 border-orange-800',
          F: 'text-red-300 bg-red-950/30 border-red-800',
        };
        const gradeLabel: Record<string, string> = {
          A: 'Very Safe',
          B: 'Below Avg Crime',
          C: 'Average',
          D: 'Above Avg Crime',
          F: 'High Crime',
        };
        // PadSplit demand signal: high renter % + moderate poverty = strong demand
        const demandSignal =
          stats.renterPct >= 55 && stats.povertyPct >= 18 ? 'Strong co-living demand expected'
          : stats.renterPct >= 45 ? 'Moderate co-living demand'
          : 'Lower renter concentration — verify local demand';

        return (
          <div className="bg-gray-900/50 border border-gray-700/40 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-400" />
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                {property.city}, {property.state} — Town Profile
              </p>
              <span className="ml-auto text-[10px] text-gray-600">{stats.dataSource}</span>
            </div>

            {/* Demographics grid */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
              {[
                { label: 'Population',    val: (stats.population / 1000).toFixed(0) + 'K' },
                { label: 'Med. HH Income', val: fmt$(stats.medianHhIncome) },
                { label: 'Median Age',    val: stats.medianAge.toFixed(0) + ' yrs' },
                { label: 'Renter %',      val: stats.renterPct + '%',   note: 'rental demand' },
                { label: 'Poverty %',     val: stats.povertyPct + '%',  note: 'affordable housing need' },
              ].map(({ label, val, note }) => (
                <div key={label} className="bg-gray-800/50 rounded-lg p-2">
                  <div className="text-[10px] text-gray-500">{label}</div>
                  <div className="text-sm font-bold text-white">{val}</div>
                  {note && <div className="text-[10px] text-gray-600 mt-0.5">{note}</div>}
                </div>
              ))}
            </div>

            {/* PadSplit demand note */}
            <div className="text-xs text-gray-500 bg-gray-800/30 rounded-lg px-3 py-2">
              <span className="text-brand-400 font-medium">PadSplit demand: </span>{demandSignal}
              {' — '}National avg renter rate: 36%
            </div>

            {/* Crime section */}
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${gradeColor[stats.crimeGrade]}`}>
                    Grade {stats.crimeGrade} — {gradeLabel[stats.crimeGrade]}
                  </span>
                  <span className="text-xs text-gray-500">
                    Violent: {stats.violentCrimePer100k.toLocaleString()}/100K
                    <span className="text-gray-700 mx-1">·</span>
                    Property: {stats.propertyCrimePer100k.toLocaleString()}/100K
                    <span className="text-gray-700 mx-1">·</span>
                    National avg: 380 / 2,200
                  </span>
                </div>
                {(stats.crimeGrade === 'D' || stats.crimeGrade === 'F') && (
                  <p className="text-xs text-orange-400/80">
                    ⚠ Higher crime may increase insurance costs and affect PadSplit tenant pipeline. 
                    Focus on specific zip-code crime maps before committing.
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Listing & location links ── */}
      <div className="bg-gray-900/40 border border-gray-700/40 rounded-xl p-4 space-y-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Property &amp; Location Links</p>
        <div className="flex flex-wrap gap-2">
          {/* Primary listing */}
          <a
            href={getListingUrl(property)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs bg-blue-950/50 border border-blue-800 text-blue-300 hover:text-blue-200 hover:bg-blue-900/50 px-3 py-2 rounded-lg transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            {property.source === 'zillow' ? 'View on Zillow' : 'Search on Zillow'}
          </a>

          {/* Realtor.com */}
          <a
            href={`https://www.realtor.com/realestateandhomes-search/${encodeURIComponent(property.city)}_${property.state}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs bg-red-950/40 border border-red-900 text-red-300 hover:text-red-200 hover:bg-red-950/60 px-3 py-2 rounded-lg transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> Realtor.com
          </a>

          {/* Google Maps */}
          <a
            href={getMapUrl(property)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700 px-3 py-2 rounded-lg transition-colors"
          >
            <Map className="w-3 h-3" /> Map
          </a>
        </div>

        {/* Town research links */}
        {(() => {
          const stats = CITY_STATS[property.city];
          if (!stats) return null;
          return (
            <div className="flex flex-wrap gap-2 pt-1">
              <a href={stats.cityDataUrl}   target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1.5 text-xs bg-gray-800/60 border border-gray-700 text-gray-400 hover:text-gray-200 px-3 py-2 rounded-lg transition-colors">
                <ExternalLink className="w-3 h-3" /> City-Data full profile
              </a>
              <a href={stats.areaVibsUrl}   target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1.5 text-xs bg-gray-800/60 border border-gray-700 text-gray-400 hover:text-gray-200 px-3 py-2 rounded-lg transition-colors">
                <ExternalLink className="w-3 h-3" /> AreaVibes livability
              </a>
              <a href={stats.crimeGradeUrl} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1.5 text-xs bg-gray-800/60 border border-gray-700 text-gray-400 hover:text-gray-200 px-3 py-2 rounded-lg transition-colors">
                <ShieldAlert className="w-3 h-3" /> CrimeGrade detail
              </a>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Manual entry form type ───────────────────────────────────────────────────

interface PropertyForm {
  address:      string;
  city:         string;
  zip:          string;
  price:        string;
  bedrooms:     string;
  bathrooms:    string;
  sqft:         string;
  yearBuilt:    string;
  propertyType: PropertyType;
  distressType: DistressType;
  listingUrl:   string;
}

const BLANK_FORM: PropertyForm = {
  address: '', city: 'Providence', zip: '02907', price: '', bedrooms: '4',
  bathrooms: '2', sqft: '', yearBuilt: '', propertyType: 'single_family',
  distressType: null, listingUrl: '',
};

// ─── Market search links helper ───────────────────────────────────────────────

function marketLinks(name: string, state: string) {
  const slug = name.toLowerCase().replace(/ /g, '-');
  const ST   = state.toUpperCase();
  return [
    { label: 'Zillow',       url: `https://www.zillow.com/homes/for_sale/${slug}-${state.toLowerCase()}_rb/`,                                  cls: 'text-blue-400' },
    { label: 'Realtor.com',  url: `https://www.realtor.com/realestateandhomes-search/${encodeURIComponent(name)}_${ST}/`,                      cls: 'text-red-400' },
    { label: 'Redfin',       url: `https://www.redfin.com/${ST}/${encodeURIComponent(name)}/`,                                                  cls: 'text-green-400' },
    { label: 'MLS Search',   url: state === 'RI'
        ? `https://www.statewidemls.com/search/results/?city=${encodeURIComponent(name)}&state=RI`
        : `https://www.mlspin.com/search-results/?state=MA&city=${encodeURIComponent(name)}`,                                                   cls: 'text-brand-400' },
  ];
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RealEstateAnalysis() {
  const { } = useInvestmentStore();
  const toast = useToast();

  // Panel state
  const [showForm,  setShowForm]  = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const [form,      setForm]      = useState<PropertyForm>(BLANK_FORM);
  const [formErr,   setFormErr]   = useState('');

  // Demo filter state
  const [selectedMarkets, setSelectedMarkets] = useState<Set<string>>(
    new Set(['Providence', 'Pawtucket', 'Woonsocket', 'Fall River', 'New Bedford'])
  );
  const [maxPrice,     setMaxPrice]     = useState(400_000);
  const [minBeds,      setMinBeds]      = useState(3);
  const [distressOnly, setDistressOnly] = useState(false);
  const [filterSig,    setFilterSig]    = useState<RESignal | 'ALL'>('ALL');

  // Results state
  const [properties, setProperties] = useState<PropertyListing[]>([]);
  const [hasResults, setHasResults] = useState(false);
  const [expanded,   setExpanded]   = useState<string | null>(null);

  // Auto-fill ZIP when city changes
  function handleCityChange(city: string) {
    const m = RE_MARKETS.find(r => r.name === city);
    setForm(f => ({ ...f, city, zip: m?.zip ?? f.zip }));
  }

  // Add manually entered property to results
  function analyzeManual() {
    const price    = parseFloat(form.price.replace(/[,$]/g, ''));
    const bedrooms = parseInt(form.bedrooms);
    const sqft     = parseInt(form.sqft.replace(/,/g, ''));
    if (!form.address.trim()) { setFormErr('Street address is required'); return; }
    if (!price || price <= 0) { setFormErr('Enter a valid list price'); return; }
    if (!sqft  || sqft  <= 0) { setFormErr('Enter square footage'); return; }
    setFormErr('');

    const listing: PropertyListing = {
      id:           `manual_${Date.now()}`,
      address:      form.address.trim(),
      city:         form.city,
      state:        RE_MARKETS.find(m => m.name === form.city)?.state ?? 'RI',
      zip:          form.zip,
      price,
      bedrooms,
      bathrooms:    parseFloat(form.bathrooms),
      sqft,
      yearBuilt:    form.yearBuilt ? parseInt(form.yearBuilt) : undefined,
      propertyType: form.propertyType,
      distressType: form.distressType,
      listingUrl:   form.listingUrl || undefined,
      source:       'sample',
    };

    setProperties(prev => [listing, ...prev]);
    setHasResults(true);
    setExpanded(listing.id);
    setShowForm(false);
    setForm(BLANK_FORM);
    toast.success(`Analysis added: ${listing.address}`);
  }

  // Load demo properties
  function loadDemo() {
    const filtered = SAMPLE_PROPERTIES.filter(p =>
      p.price <= maxPrice &&
      p.bedrooms >= minBeds &&
      selectedMarkets.has(p.city) &&
      (!distressOnly || p.distressType !== null)
    );
    setProperties(filtered);
    setHasResults(true);
    setExpanded(null);
    if (filtered.length === 0)
      toast.info('No demo properties match current filters — try relaxing the criteria.');
  }

  // Analyse all properties
  const analysed = useMemo(() =>
    properties
      .map(p => ({ property: p, analysis: analyzePadSplit(p, getMarketConfig(p.city, p.state)) }))
      .sort((a, b) => b.analysis.padSplitScore - a.analysis.padSplitScore),
    [properties]
  );

  const filtered = filterSig === 'ALL'
    ? analysed
    : analysed.filter(r => r.analysis.signal === filterSig);

  const counts = {
    STRONG_BUY: analysed.filter(r => r.analysis.signal === 'STRONG_BUY').length,
    BUY:        analysed.filter(r => r.analysis.signal === 'BUY').length,
    WATCH:      analysed.filter(r => r.analysis.signal === 'WATCH').length,
    HOLD:       analysed.filter(r => r.analysis.signal === 'HOLD').length,
    PASS:       analysed.filter(r => r.analysis.signal === 'PASS').length,
  };

  const inputCls = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-brand-500';
  const labelCls = 'block text-xs text-gray-500 mb-1';

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-white font-bold text-lg flex items-center gap-2">
          <Home className="w-5 h-5 text-brand-400" />
          Real Estate — PadSplit Co-living Investment Analyzer
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          Analyze any Rhode Island or Southern Massachusetts property for PadSplit co-living viability.
          Enter a property you found on Zillow, Realtor.com, or any other source, or load demo properties.
        </p>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 bg-amber-950/30 border border-amber-800 rounded-xl p-3 text-amber-200 text-xs">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
        <span>
          <strong>For research and educational purposes only.</strong> Figures are estimates.
          Always conduct full due diligence with a licensed real estate agent, attorney, and accountant.
          Analysis assumes 7.5% 30-yr fixed rate and 25% down payment.
        </span>
      </div>

      {/* ── Action bar ── */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => { setShowForm(v => !v); }}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Analyze a Property'}
        </button>
        <button
          onClick={() => setShowLinks(v => !v)}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Search className="w-4 h-4" />
          Find Properties Online
        </button>
      </div>

      {/* ── Manual entry form ── */}
      {showForm && (
        <div className="bg-gray-900/70 border border-brand-800/60 rounded-2xl p-5 space-y-4">
          <h3 className="text-gray-300 font-semibold text-sm flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-brand-400" />
            Enter Property Details
          </h3>
          <p className="text-xs text-gray-500">
            Find a listing on Zillow, Realtor.com, or any MLS site, then paste the details here
            to get a full PadSplit investment analysis.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Address */}
            <div className="sm:col-span-2">
              <label className={labelCls}>Street Address *</label>
              <input
                type="text"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="e.g. 142 Broad St"
                className={inputCls}
              />
            </div>

            {/* City */}
            <div>
              <label className={labelCls}>City *</label>
              <select value={form.city} onChange={e => handleCityChange(e.target.value)} className={inputCls}>
                {RE_MARKETS.map(m => (
                  <option key={m.name} value={m.name}>{m.name}, {m.state}</option>
                ))}
              </select>
            </div>

            {/* ZIP */}
            <div>
              <label className={labelCls}>ZIP Code</label>
              <input
                type="text"
                value={form.zip}
                onChange={e => setForm(f => ({ ...f, zip: e.target.value }))}
                maxLength={5}
                className={inputCls}
              />
            </div>

            {/* Price */}
            <div>
              <label className={labelCls}>List Price ($) *</label>
              <input
                type="text"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                placeholder="e.g. 285000"
                className={inputCls}
              />
            </div>

            {/* Sqft */}
            <div>
              <label className={labelCls}>Square Feet *</label>
              <input
                type="text"
                value={form.sqft}
                onChange={e => setForm(f => ({ ...f, sqft: e.target.value }))}
                placeholder="e.g. 1600"
                className={inputCls}
              />
            </div>

            {/* Bedrooms */}
            <div>
              <label className={labelCls}>Bedrooms</label>
              <select value={form.bedrooms} onChange={e => setForm(f => ({ ...f, bedrooms: e.target.value }))} className={inputCls}>
                {['1','2','3','4','5','6'].map(v => <option key={v} value={v}>{v} bedrooms</option>)}
              </select>
            </div>

            {/* Bathrooms */}
            <div>
              <label className={labelCls}>Bathrooms</label>
              <select value={form.bathrooms} onChange={e => setForm(f => ({ ...f, bathrooms: e.target.value }))} className={inputCls}>
                {['1','1.5','2','2.5','3','3.5'].map(v => <option key={v} value={v}>{v} bathrooms</option>)}
              </select>
            </div>

            {/* Year built */}
            <div>
              <label className={labelCls}>Year Built (optional)</label>
              <input
                type="text"
                value={form.yearBuilt}
                onChange={e => setForm(f => ({ ...f, yearBuilt: e.target.value }))}
                placeholder="e.g. 1952"
                className={inputCls}
              />
            </div>

            {/* Property type */}
            <div>
              <label className={labelCls}>Property Type</label>
              <select value={form.propertyType} onChange={e => setForm(f => ({ ...f, propertyType: e.target.value as PropertyType }))} className={inputCls}>
                <option value="single_family">Single Family</option>
                <option value="multi_family">Multi-Family</option>
                <option value="duplex">Duplex</option>
                <option value="triplex">Triplex</option>
                <option value="quadplex">Quadplex</option>
                <option value="condo">Condo</option>
              </select>
            </div>

            {/* Distress type */}
            <div>
              <label className={labelCls}>Distress Type (if any)</label>
              <select value={form.distressType ?? ''} onChange={e => setForm(f => ({ ...f, distressType: (e.target.value || null) as DistressType }))} className={inputCls}>
                <option value="">None / Standard Listing</option>
                <option value="pre_foreclosure">Pre-Foreclosure</option>
                <option value="foreclosure">Foreclosure / Bank-Owned</option>
                <option value="reo">REO (HUD/Fannie/Freddie)</option>
                <option value="auction">Auction</option>
                <option value="bankruptcy">Bankruptcy Estate</option>
              </select>
            </div>

            {/* Listing URL */}
            <div className="sm:col-span-2">
              <label className={labelCls}>Listing URL (optional — Zillow, Realtor, etc.)</label>
              <input
                type="url"
                value={form.listingUrl}
                onChange={e => setForm(f => ({ ...f, listingUrl: e.target.value }))}
                placeholder="https://www.zillow.com/homedetails/..."
                className={inputCls}
              />
            </div>
          </div>

          {formErr && <p className="text-xs text-red-400">{formErr}</p>}

          <button
            onClick={analyzeManual}
            className="w-full sm:w-auto flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-8 py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            <BarChart2 className="w-4 h-4" /> Run Analysis
          </button>
        </div>
      )}

      {/* ── Find Properties Online ── */}
      {showLinks && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-gray-300 font-semibold text-sm flex items-center gap-2">
              <Search className="w-4 h-4 text-brand-400" />
              Find Properties — RI &amp; Southern MA Markets
            </h3>
            <span className="text-xs text-gray-600">Click a market to open search. Then enter the property details above.</span>
          </div>
          <div className="space-y-3">
            {RE_MARKETS.map(m => {
              const links = marketLinks(m.name, m.state);
              return (
                <div key={m.name} className="flex flex-wrap items-center gap-3 bg-gray-800/40 rounded-xl px-4 py-3">
                  <div className="shrink-0 w-28">
                    <div className="text-sm text-white font-medium">{m.name}</div>
                    <div className="text-xs text-gray-500">{m.state} · med {fmt$(m.medianPrice)}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {links.map(l => (
                      <a
                        key={l.label}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-gray-900 border border-gray-700 hover:border-gray-500 transition-colors ${l.cls}`}
                      >
                        <ExternalLink className="w-3 h-3" /> {l.label}
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-600">
            💡 <strong className="text-gray-500">Tip:</strong> Filter for 3+ bedrooms, under your max price.
            Once you find a promising listing, copy the details and click "Analyze a Property" above.
          </p>
        </div>
      )}

      {/* ── Demo property loader ── */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-gray-500" />
          <h3 className="text-gray-400 font-semibold text-sm">Load Demo Properties</h3>
          <span className="ml-1 text-xs text-gray-600">(pre-built sample dataset with realistic RI/MA listings)</span>
        </div>

        {/* Market toggles */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {RE_MARKETS.map(m => (
            <button
              key={m.name}
              onClick={() => setSelectedMarkets(prev => {
                const next = new Set(prev);
                next.has(m.name) ? next.delete(m.name) : next.add(m.name);
                return next;
              })}
              className={`px-3 py-2 rounded-lg text-xs border transition-all text-left ${
                selectedMarkets.has(m.name)
                  ? 'border-brand-500 text-brand-300 bg-brand-900/20'
                  : 'border-gray-700 text-gray-500 hover:border-gray-500'
              }`}
            >
              <div className="font-semibold">{m.name}</div>
              <div className="text-gray-600">{m.state} · {fmt$(m.medianPrice)}</div>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Max Price</label>
            <select value={maxPrice} onChange={e => setMaxPrice(Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
              {[200_000, 250_000, 300_000, 350_000, 400_000, 500_000].map(v => (
                <option key={v} value={v}>{fmt$(v)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Min Bedrooms</label>
            <select value={minBeds} onChange={e => setMinBeds(Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
              {[3, 4, 5].map(v => <option key={v} value={v}>{v}+ beds</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <button
              onClick={() => setDistressOnly(v => !v)}
              className={`w-9 h-5 rounded-full border transition-all relative ${
                distressOnly ? 'bg-brand-600 border-brand-500' : 'bg-gray-800 border-gray-600'
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${distressOnly ? 'left-4' : 'left-0.5'}`} />
            </button>
            <span className="text-xs text-gray-400">Distressed / bankruptcy only</span>
          </div>
          <button
            onClick={loadDemo}
            disabled={selectedMarkets.size === 0}
            className="ml-auto flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <Search className="w-4 h-4" /> Load Demo Data
          </button>
        </div>
      </div>

      {/* ── Results ── */}
      {hasResults && (
        <div className="space-y-4">
          {analysed.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-gray-500">{analysed.length} properties · Filter:</span>
              {(['STRONG_BUY', 'BUY', 'WATCH', 'HOLD', 'PASS'] as RESignal[]).map(sig => (
                <button
                  key={sig}
                  onClick={() => setFilterSig(filterSig === sig ? 'ALL' : sig)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                    filterSig === sig
                      ? `${SIG_CFG[sig].cls} scale-105`
                      : 'border-gray-700 bg-gray-900/50 hover:border-gray-500 text-gray-400'
                  }`}
                >
                  {counts[sig]} {SIG_CFG[sig].label}
                </button>
              ))}
              {properties.length > 0 && (
                <button
                  onClick={() => { setProperties([]); setHasResults(false); setFilterSig('ALL'); }}
                  className="ml-auto text-xs text-gray-600 hover:text-gray-400"
                >
                  Clear all
                </button>
              )}
            </div>
          )}

          {filtered.length === 0 && (
            <div className="text-center py-10 text-gray-500">
              <Building2 className="w-10 h-10 mx-auto mb-3 text-gray-700" />
              <p className="font-medium">No properties match current filters</p>
            </div>
          )}

          {filtered.map(({ property: p, analysis: a }) => {
            const sig      = SIG_CFG[a.signal];
            const distress = p.distressType ? DISTRESS_CFG[p.distressType] : null;
            const isExp    = expanded === p.id;

            return (
              <div key={p.id} className={`rounded-xl border border-gray-800 overflow-hidden ${sig.rowCls}`}>
                <div
                  role="button" tabIndex={0}
                  className="w-full flex items-start gap-3 px-5 py-4 hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={() => setExpanded(isExp ? null : p.id)}
                  onKeyDown={e => e.key === 'Enter' && setExpanded(isExp ? null : p.id)}
                >
                  {/* Score */}
                  <div className={`shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center text-xs font-bold ${
                    a.padSplitScore >= 70 ? 'bg-emerald-900/60 text-emerald-300'
                    : a.padSplitScore >= 45 ? 'bg-yellow-900/40 text-yellow-400'
                    : 'bg-gray-800 text-gray-500'
                  }`}>
                    {a.padSplitScore}
                    <span className="text-[9px] font-normal opacity-70">/100</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${sig.cls}`}>{sig.label}</span>
                      {distress && <span className={`text-xs px-2 py-0.5 rounded border font-medium ${distress.cls}`}>{distress.label}</span>}
                      {p.source === 'sample' && !distress && <span className="text-xs text-gray-600 border border-gray-800 px-2 py-0.5 rounded">{p.id.startsWith('manual') ? 'Manual entry' : 'Demo'}</span>}
                      {p.daysOnMarket !== undefined && <span className="text-xs text-gray-600">{p.daysOnMarket}d on market</span>}
                    </div>
                    <div className="font-semibold text-white text-sm">{p.address}</div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400 mt-0.5">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{p.city}, {p.state} {p.zip}</span>
                      <span className="flex items-center gap-1"><Building className="w-3 h-3" />{p.bedrooms}bd/{p.bathrooms}ba</span>
                      <span className="flex items-center gap-1"><Ruler className="w-3 h-3" />{p.sqft.toLocaleString()} sqft</span>
                      {p.yearBuilt && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Built {p.yearBuilt}</span>}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="shrink-0 text-right hidden sm:block">
                    <div className="text-white font-bold text-base">{fmt$(p.price)}</div>
                    <div className="flex gap-3 text-xs mt-1 justify-end">
                      <span className="text-gray-500">Cap <span className={a.capRate >= 7 ? 'text-emerald-400' : 'text-yellow-400'}>{fmtPct(a.capRate)}</span></span>
                      <span className="text-gray-500">CoC <span className={a.cocReturn >= 8 ? 'text-emerald-400' : 'text-yellow-400'}>{fmtPct(a.cocReturn)}</span></span>
                      <span className="text-gray-500">DSCR <span className={a.dscr >= 1.25 ? 'text-emerald-400' : a.dscr >= 1 ? 'text-yellow-400' : 'text-red-400'}>{a.dscr.toFixed(2)}</span></span>
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">{fmt$(a.grossMonthlyRev)}/mo · {a.estimatedRooms} rooms</div>
                  </div>

                  {isExp ? <ChevronUp className="w-4 h-4 text-gray-500 shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0 mt-1" />}
                </div>

                {isExp && <PropertyDetail property={p} analysis={a} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Distressed resources */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-gray-300 font-semibold text-sm flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-brand-400" />
          Distressed Property Sources — RI &amp; Southern MA
        </h3>
        <p className="text-xs text-gray-500">
          Official sources for foreclosures, REO, bankruptcy estate sales, and auctions.
          Bankruptcy properties require court approval — engage a real estate attorney.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DISTRESSED_RESOURCES.map(r => (
            <a key={r.name} href={r.url} target="_blank" rel="noopener noreferrer"
              className="flex items-start gap-3 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-xl p-3 transition-colors">
              <ExternalLink className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm text-white font-medium">{r.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{r.desc}</div>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* PadSplit explainer */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-gray-300 font-semibold text-sm flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-brand-400" />
          PadSplit Co-living Model — How it Works
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-gray-400">
          <div className="space-y-2">
            <div className="font-semibold text-gray-300">The Setup</div>
            <ul className="space-y-1 list-disc list-inside">
              <li>Buy a 3–5 bedroom single-family home</li>
              <li>Install locks on each bedroom door (~$200/room)</li>
              <li>Furnish each room minimally ($1,500–3,000/room)</li>
              <li>List on PadSplit platform</li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="font-semibold text-gray-300">The Revenue</div>
            <ul className="space-y-1 list-disc list-inside">
              <li>Each room rents weekly (~$160–225/week in RI/MA)</li>
              <li>Landlord covers all utilities</li>
              <li>PadSplit takes ~19% platform fee</li>
              <li>Typically 30–60% more income vs traditional rental</li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="font-semibold text-gray-300">Key Risks</div>
            <ul className="space-y-1 list-disc list-inside text-amber-600">
              <li>Higher tenant turnover than traditional</li>
              <li>Zoning laws vary — verify with city</li>
              <li>Utility costs spike with multiple tenants</li>
              <li>Wear-and-tear higher than single-family rental</li>
            </ul>
          </div>
        </div>
      </div>

    </div>
  );
}
