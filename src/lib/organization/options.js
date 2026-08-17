export const INDUSTRY_OPTIONS = [
  "Accounting & Auditing Firms",
  "Agriculture",
  "Automobile",
  "Construction",
  "Consulting",
  "Education",
  "Engineering",
  "Financial Services",
  "Food & Beverage",
  "Healthcare",
  "Hospitality",
  "Import & Export",
  "Information Technology",
  "Manufacturing",
  "Media & Advertising",
  "Non-Profit",
  "Pharmacy",
  "Professional Services",
  "Real Estate",
  "Restaurant",
  "Retail",
  "Trading",
  "Transport & Logistics",
  "Wholesale",
  "Other",
];

export const INDUSTRY_VALUES = INDUSTRY_OPTIONS;

// Maps each canonical English industry value (what's actually stored in
// the DB and suggested by the Industry combobox) to its i18n key, so
// display code can render the Nepali label in Nepali mode. A value the
// user typed freely (not from the suggestion list) has no entry here and
// renders as-is — free text genuinely can't be auto-translated.
export const INDUSTRY_I18N_KEYS = {
  "Accounting & Auditing Firms": "industryAccountingAuditing",
  Agriculture: "industryAgriculture",
  Automobile: "industryAutomobile",
  Construction: "industryConstruction",
  Consulting: "industryConsulting",
  Education: "industryEducation",
  Engineering: "industryEngineering",
  "Financial Services": "industryFinancialServices",
  "Food & Beverage": "industryFoodBeverage",
  Healthcare: "industryHealthcare",
  Hospitality: "industryHospitality",
  "Import & Export": "industryImportExport",
  "Information Technology": "industryInformationTechnology",
  Manufacturing: "industryManufacturing",
  "Media & Advertising": "industryMediaAdvertising",
  "Non-Profit": "industryNonProfit",
  Pharmacy: "industryPharmacy",
  "Professional Services": "industryProfessionalServices",
  "Real Estate": "industryRealEstate",
  Restaurant: "industryRestaurant",
  Retail: "industryRetail",
  Trading: "industryTrading",
  "Transport & Logistics": "industryTransportLogistics",
  Wholesale: "industryWholesale",
  Other: "industryOther",
};

// `t` works the same shape whether it's from useTranslation() (client) or
// getServerT() (Server Components) — this is a pure function, safe in both.
export function translateIndustry(t, value) {
  if (!value) return value;
  const key = INDUSTRY_I18N_KEYS[value];
  return key ? t(key) : value;
}

// The fixed set of accounting features offered when creating/editing an
// organization. Shared between the wizard (which pairs these with icons)
// and every other place enabledFeatures gets displayed (organizations
// list/detail, dashboard) — so a feature key never renders as a raw
// string like "trackInventory" instead of its translated label.
export const FEATURE_LABEL_KEYS = {
  trackInventory: "featureTrackInventory",
  multipleLocations: "featureMultipleLocations",
  manufacturing: "featureManufacturing",
  multipleWarehouses: "featureMultipleWarehouses",
  posRetail: "featurePosRetail",
  multiCurrency: "featureMultiCurrency",
  posRestaurant: "featurePosRestaurant",
};

export function translateFeature(t, key) {
  const labelKey = FEATURE_LABEL_KEYS[key];
  return labelKey ? t(labelKey) : key;
}
