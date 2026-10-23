/**
 * IAR chart of accounts as used on the Requisition Form today: 24 funds and
 * 97 sub-accounts, taken from the "Funds Codes" tab of the PO response sheet
 * (Oct 2026). 27 sub-accounts have no number yet, and some numbers (56000,
 * 50300) repeat across funds, so an account is identified by its id, never by
 * its code alone. The chart of accounts review with the finance office will
 * replace this list; later it moves to the database, edited from Portal Settings.
 */
export type Account = { id: string; fund: string; code: string | null; name: string };

export const ACCOUNTS: Account[] = [
  { id: "a1", fund: "General Fund Expenses", code: "01-5001", name: "Salary and Temp Labor Pay" },
  { id: "a2", fund: "General Fund Expenses", code: "01-5003", name: "Administrative Expenses" },
  { id: "a3", fund: "General Fund Expenses", code: "01-5004", name: "Charges and fees" },
  { id: "a4", fund: "General Fund Expenses", code: "01-5005", name: "Property Taxes & insurance" },
  { id: "a5", fund: "General Fund Expenses", code: "01-5006", name: "Utilities" },
  { id: "a6", fund: "General Fund Expenses", code: "01-5008", name: "Miscellaneous & Others" },
  { id: "a7", fund: "General Fund Expenses", code: "01-5009", name: "Cleaning supplies and expenses" },
  { id: "a8", fund: "Da'wah Expenses", code: "02-5003", name: "Dawah Committee expenses" },
  { id: "a9", fund: "Da'wah Expenses", code: "02-5004", name: "Open house & Special events" },
  { id: "a10", fund: "Da'wah Expenses", code: "02-5005", name: "Outreach and hospitality" },
  { id: "a11", fund: "Da'wah Expenses", code: "02-5006", name: "Hajj" },
  { id: "a12", fund: "Da'wah Expenses", code: null, name: "EASE Project - Dawah" },
  { id: "a13", fund: "Education Expenses", code: "03-5001", name: "Salary & Temp Labor Pay" },
  { id: "a14", fund: "Education Expenses", code: "03-5003", name: "Education Committee expenses" },
  { id: "a15", fund: "Facility Maintenance Expenses", code: "04-4001", name: "Facility Maintenance Revenue" },
  { id: "a16", fund: "Facility Maintenance Expenses", code: "04-5001", name: "Salary & Temp Labor pay" },
  { id: "a17", fund: "Facility Maintenance Expenses", code: "04-5003", name: "General" },
  { id: "a18", fund: "Facility Maintenance Expenses", code: "04-5005", name: "HVAC" },
  { id: "a19", fund: "Facility Maintenance Expenses", code: "04-5006", name: "Plumbing" },
  { id: "a20", fund: "Facility Maintenance Expenses", code: "04-5007", name: "Electrical" },
  { id: "a21", fund: "Facility Maintenance Expenses", code: "04-5008", name: "Structure" },
  { id: "a22", fund: "Facility Maintenance Expenses", code: "04-5009", name: "A/V and Technology" },
  { id: "a23", fund: "Facility Maintenance Expenses", code: "04-5010", name: "Landscaping" },
  { id: "a24", fund: "Facility Maintenance Expenses", code: null, name: "Fire/Elevator" },
  { id: "a25", fund: "Safety and Security Expenses", code: "05-5001", name: "Salary & Temp Labor Pay" },
  { id: "a26", fund: "Safety and Security Expenses", code: "05-5003", name: "Committee Expenes-Material & supply" },
  { id: "a27", fund: "Safety and Security Expenses", code: "05-5004", name: "Parking Rent" },
  { id: "a28", fund: "Safety and Security Expenses", code: "05-5005", name: "Safety and Security Misc. Exepnses" },
  { id: "a29", fund: "Safety and Security Expenses", code: null, name: "Uniform Expenses" },
  { id: "a30", fund: "Senior Committee Expenses", code: null, name: "Sr. Committee Expenses" },
  { id: "a31", fund: "Senior Committee Expenses", code: "56000", name: "Program Expenses" },
  { id: "a32", fund: "Senior Committee Expenses", code: "50300", name: "Payroll Costs - Temp Labor" },
  { id: "a33", fund: "Health and Wellness Expenses", code: "56000", name: "Program Expenses" },
  { id: "a34", fund: "Sports & Recreation Expenses", code: null, name: "Sports Committee Expenses" },
  { id: "a35", fund: "Sports & Recreation Expenses", code: "56000", name: "Program Expenses" },
  { id: "a36", fund: "Sports & Recreation Expenses", code: "50300", name: "Payroll Costs - Temp Labor" },
  { id: "a37", fund: "Youth Expenses", code: "50300", name: "Payroll Costs - Temp Labor" },
  { id: "a38", fund: "Youth Expenses", code: "56000", name: "Program Expenses" },
  { id: "a39", fund: "Youth Expenses", code: "08-5005", name: "Misc & Other" },
  { id: "a40", fund: "Women Expenses", code: "09-5001", name: "Salary & Temp Labor Pay" },
  { id: "a41", fund: "Women Expenses", code: "09-5002", name: "Internal Trans Expense" },
  { id: "a42", fund: "Women Expenses", code: "09-5003", name: "Women Committee Expenses" },
  { id: "a43", fund: "Al-Furqan School Expenses", code: "20-5001", name: "Salary & Temp Labor Pay" },
  { id: "a44", fund: "Al-Furqan School Expenses", code: "20-5003", name: "Committee expenses" },
  { id: "a45", fund: "Al-Furqan School Expenses", code: "20-5004", name: "Books, Materials & Other supplies" },
  { id: "a46", fund: "Al-Iman School Expenses", code: "21-5003", name: "Al-Iman School Committee Expenses" },
  { id: "a47", fund: "An-Noor School Expenses", code: "22-5001", name: "Salary & Temp Labor Pay" },
  { id: "a48", fund: "An-Noor School Expenses", code: "22-5003", name: "Committee Expenses" },
  { id: "a49", fund: "An-Noor School Expenses", code: "22-5004", name: "Books, Materials & Supplies" },
  { id: "a50", fund: "An-Noor School Expenses", code: "23-5003", name: "An-Noor Sponsorships Expenses" },
  { id: "a51", fund: "Cemetery Expenses", code: "25-5001", name: "Salary & Temp Labor Pay" },
  { id: "a52", fund: "Cemetery Expenses", code: "25-5002", name: "Internal Trans - Expense" },
  { id: "a53", fund: "Cemetery Expenses", code: "25-5003", name: "Cemetery expenses" },
  { id: "a54", fund: "Construction Expenses", code: "26-5003", name: "Construction expenses" },
  { id: "a55", fund: "Social & Welfare", code: null, name: "Zakat Ul Mal Fund Expenses" },
  { id: "a56", fund: "Social & Welfare", code: null, name: "Zakat Ul Fitr Fund Expenses" },
  { id: "a57", fund: "Social & Welfare", code: null, name: "Udhiya Fund Expenses" },
  { id: "a58", fund: "Social & Welfare", code: null, name: "Sadaqah Fund Expenses" },
  { id: "a59", fund: "Social & Welfare", code: null, name: "Rohingya Relief Fund Expenses" },
  { id: "a60", fund: "Social & Welfare", code: null, name: "Palestine Relief Fund Expenses" },
  { id: "a61", fund: "Social & Welfare", code: null, name: "Iftar fund Expenses" },
  { id: "a62", fund: "Social & Welfare", code: null, name: "Food Pantry Fund Expenses" },
  { id: "a63", fund: "Social & Welfare", code: null, name: "Fidya Fund Expenses" },
  { id: "a64", fund: "Social & Welfare", code: null, name: "Fi Sabeelilah/ZDP Fund Expenses" },
  { id: "a65", fund: "Social & Welfare", code: "55000", name: "Funds Paid for Social Welfare" },
  { id: "a66", fund: "IAR Reserve Fund", code: "42-5003", name: "IAR Reserve Fund Disbursements" },
  { id: "a67", fund: "Endowment Expenses", code: "60-5002", name: "Internal Transfers" },
  { id: "a68", fund: "Endowment Expenses", code: "60-5003", name: "Endowment expenses" },
  { id: "a69", fund: "Endowment Expenses", code: "60-1010", name: "Endowment disbursement funds" },
  { id: "a70", fund: "Endowment Expenses", code: "60-1013", name: "Mumtaz and Badaruddin Fund" },
  { id: "a71", fund: "Page Rd", code: null, name: "TMC Page Rd Expenses" },
  { id: "a72", fund: "Page Rd", code: "63000", name: "Building Expenses" },
  { id: "a73", fund: "Page Rd", code: "63000", name: "Bulding Lease" },
  { id: "a74", fund: "Imam's Office Fund Expenses", code: "50300", name: "Payroll Costs - Speaker, Honorarium" },
  { id: "a75", fund: "Imam's Office Fund Expenses", code: "56000", name: "Program Expenses" },
  { id: "a76", fund: "Imam's Office Fund Expenses", code: null, name: "Office supplies" },
  { id: "a77", fund: "Imam's Office Fund Expenses", code: null, name: "Quran Competition Expenses" },
  { id: "a78", fund: "Imam's Office Fund Expenses", code: null, name: "Marriage Expenses" },
  { id: "a79", fund: "Imam's Office Fund Expenses", code: "61000", name: "Dues & Subscriptions" },
  { id: "a80", fund: "Imam's Office Fund Expenses", code: null, name: "Khatem Alquran - Ramadan Exp." },
  { id: "a81", fund: "IAR Cafe Expenses", code: "40-5001", name: "Salary & Temp Labor Pay" },
  { id: "a82", fund: "IAR Cafe Expenses", code: "40-5002", name: "Internal transfer" },
  { id: "a83", fund: "IAR Cafe Expenses", code: "40-5003", name: "Kitchen expenses" },
  { id: "a84", fund: "IAR Cafe Expenses", code: "40-5004", name: "Credit Card and bank charges" },
  { id: "a85", fund: "IAR Cafe Expenses", code: "40-5005", name: "Cafe Inventory" },
  { id: "a86", fund: "Creative Scholars Academy", code: "50300", name: "Payroll Costs - Temp Labor" },
  { id: "a87", fund: "Creative Scholars Academy", code: null, name: "Books, Materials & Supplies" },
  { id: "a88", fund: "Creative Scholars Academy", code: "56000", name: "Program Expenses" },
  { id: "a89", fund: "Cleaning Committee Expenses", code: null, name: "Cleaning agents and chemicals" },
  { id: "a90", fund: "Cleaning Committee Expenses", code: null, name: "Cleaning tools (mops, brooms, vacuum cleaners, etc.)" },
  { id: "a91", fund: "Cleaning Committee Expenses", code: null, name: "Safety equipment (gloves, masks, protective eyewear)" },
  { id: "a92", fund: "Cleaning Committee Expenses", code: null, name: "Office supplies" },
  { id: "a93", fund: "Cleaning Committee Expenses", code: "50300", name: "Payroll Costs - Temp Labor" },
  { id: "a94", fund: "Event Committee Expenses", code: null, name: "Aid Al-Adha Expenses" },
  { id: "a95", fund: "Event Committee Expenses", code: null, name: "Aid El-Fiter Expenses" },
  { id: "a96", fund: "Event Committee Expenses", code: "56000", name: "Program Expenses" },
  { id: "a97", fund: "Event Committee Expenses", code: "50300", name: "Payroll Costs - Temp Labor" },
];

export const FUNDS: string[] = [
  "General Fund Expenses",
  "Da'wah Expenses",
  "Education Expenses",
  "Facility Maintenance Expenses",
  "Safety and Security Expenses",
  "Senior Committee Expenses",
  "Health and Wellness Expenses",
  "Sports & Recreation Expenses",
  "Youth Expenses",
  "Women Expenses",
  "Al-Furqan School Expenses",
  "Al-Iman School Expenses",
  "An-Noor School Expenses",
  "Cemetery Expenses",
  "Construction Expenses",
  "Social & Welfare",
  "IAR Reserve Fund",
  "Endowment Expenses",
  "Page Rd",
  "Imam's Office Fund Expenses",
  "IAR Cafe Expenses",
  "Creative Scholars Academy",
  "Cleaning Committee Expenses",
  "Event Committee Expenses",
];

/** The fund whose requests are aid to individuals; see restricted visibility. */
export const SOCIAL_WELFARE_FUND = "Social & Welfare";

export function findAccount(id: string): Account | undefined {
  return ACCOUNTS.find((a) => a.id === id);
}

/** Pay for people's work (temp labor, salary, speaker honoraria): the payee needs a W-9 on file. */
export function isLaborAccount(a: Account | undefined): boolean {
  return Boolean(a && /labor|payroll|salary|honorarium/i.test(a.name));
}

export function accountsForFund(fund: string): Account[] {
  return ACCOUNTS.filter((a) => a.fund === fund);
}

/** "01-5003 · Administrative Expenses", or just the name when it has no number. */
export function accountLabel(a: Account | undefined): string {
  if (!a) return "Unknown account";
  return a.code ? `${a.code} · ${a.name}` : a.name;
}

/** Short fund name for tight spaces: "Youth" for "Youth Expenses". */
export function shortFund(fund: string): string {
  return fund.replace(/ (Fund )?Expenses$/, "");
}
