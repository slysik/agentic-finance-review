import { Transaction } from './csv-processor';

interface CategoryRule {
  patterns: RegExp[];
  category: string;
}

// Category rules based on common transaction patterns
const CATEGORY_RULES: CategoryRule[] = [
  // Income
  {
    patterns: [/payroll/i, /salary/i, /direct deposit/i, /employer/i],
    category: 'Salary',
  },
  {
    patterns: [/bonus/i, /incentive/i],
    category: 'Bonus',
  },
  {
    patterns: [/interest (payment|earned|credit)/i, /apy/i],
    category: 'Interest',
  },
  {
    patterns: [/dividend/i],
    category: 'Dividends',
  },
  {
    patterns: [/refund/i, /rebate/i, /cashback/i],
    category: 'Refunds',
  },

  // Groceries
  {
    patterns: [
      /trader joe/i, /whole foods/i, /safeway/i, /kroger/i, /publix/i,
      /albertsons/i, /food coop/i, /grocery/i, /costco/i, /sam'?s club/i,
      /aldi/i, /wegmans/i, /h-?e-?b/i, /target.*grocery/i, /walmart.*grocery/i,
      /sprouts/i, /fresh market/i, /food mart/i, /supermarket/i,
    ],
    category: 'Groceries',
  },

  // Restaurants & Dining
  {
    patterns: [
      /restaurant/i, /doordash/i, /uber ?eats/i, /grubhub/i, /postmates/i,
      /chipotle/i, /mcdonald/i, /starbucks/i, /dunkin/i, /subway/i,
      /pizza/i, /burger/i, /cafe/i, /coffee/i, /diner/i, /grill/i,
      /sweetgreen/i, /chick-?fil-?a/i, /panera/i, /wendy/i, /taco bell/i,
      /kfc/i, /popeyes/i, /five guys/i, /shake shack/i, /panda express/i,
    ],
    category: 'Restaurants & Dining',
  },

  // Subscriptions
  {
    patterns: [
      /netflix/i, /spotify/i, /hulu/i, /disney\+/i, /hbo ?max/i,
      /apple ?(music|tv|one|arcade)/i, /amazon prime/i, /youtube/i,
      /paramount/i, /peacock/i, /audible/i, /kindle/i, /nytimes/i,
      /subscription/i, /membership/i, /monthly fee/i,
    ],
    category: 'Subscriptions',
  },

  // Software & Services
  {
    patterns: [
      /openai/i, /anthropic/i, /claude/i, /chatgpt/i, /cursor/i,
      /github/i, /gitlab/i, /aws/i, /azure/i, /google cloud/i,
      /digitalocean/i, /heroku/i, /vercel/i, /netlify/i, /cloudflare/i,
      /notion/i, /figma/i, /canva/i, /adobe/i, /microsoft 365/i,
      /dropbox/i, /slack/i, /zoom/i, /calendly/i, /zapier/i,
      /replicate/i, /elevenlabs/i, /midjourney/i, /runway/i,
      /tradingview/i, /webflow/i, /airtable/i, /hubspot/i,
    ],
    category: 'Software & Services',
  },

  // Utilities
  {
    patterns: [
      /electric/i, /gas co/i, /water (bill|utility)/i, /sewage/i,
      /con ?ed/i, /pge/i, /duke energy/i, /xcel/i, /utility/i,
      /power company/i, /national grid/i,
    ],
    category: 'Utilities',
  },

  // Internet & Cable
  {
    patterns: [
      /comcast/i, /xfinity/i, /spectrum/i, /verizon fios/i, /att.*internet/i,
      /t-?mobile.*home/i, /cox/i, /frontier/i, /optimum/i, /cable/i,
      /internet service/i, /broadband/i,
    ],
    category: 'Internet & Cable',
  },

  // Phone
  {
    patterns: [
      /verizon wireless/i, /t-?mobile/i, /att.*wireless/i, /sprint/i,
      /at&t/i, /cricket/i, /metro ?pcs/i, /mint mobile/i, /visible/i,
      /google fi/i, /phone bill/i, /cell(ular)?/i,
    ],
    category: 'Phone',
  },

  // Insurance
  {
    patterns: [
      /insurance/i, /geico/i, /progressive/i, /state farm/i, /allstate/i,
      /liberty mutual/i, /nationwide/i, /usaa/i, /aetna/i, /cigna/i,
      /blue cross/i, /united health/i, /kaiser/i, /anthem/i,
    ],
    category: 'Insurance',
  },

  // Transportation
  {
    patterns: [
      /uber(?! ?eats)/i, /lyft/i, /taxi/i, /cab\b/i, /mta/i, /metro/i,
      /transit/i, /subway/i, /bus pass/i, /parking/i, /garage/i,
      /toll/i, /e-?zpass/i,
    ],
    category: 'Transportation',
  },

  // Gas
  {
    patterns: [
      /shell/i, /chevron/i, /exxon/i, /mobil/i, /bp\b/i, /arco/i,
      /76\b/i, /texaco/i, /gas station/i, /fuel/i, /petroleum/i,
      /speedway/i, /wawa.*gas/i, /costco.*gas/i,
    ],
    category: 'Gas',
  },

  // Shopping
  {
    patterns: [
      /amazon(?!.*prime)/i, /walmart/i, /target/i, /best buy/i, /home depot/i,
      /lowes/i, /ikea/i, /wayfair/i, /bed bath/i, /macy/i, /nordstrom/i,
      /tj ?maxx/i, /marshalls/i, /ross/i, /kohls/i, /jc ?penney/i,
      /gap/i, /old navy/i, /h&m/i, /zara/i, /uniqlo/i, /nike/i, /adidas/i,
      /apple store/i, /etsy/i, /ebay/i,
    ],
    category: 'Shopping',
  },

  // Health & Medical
  {
    patterns: [
      /pharmacy/i, /cvs/i, /walgreens/i, /rite aid/i, /hospital/i,
      /clinic/i, /medical/i, /doctor/i, /dentist/i, /optom/i,
      /urgent care/i, /quest diag/i, /labcorp/i, /prescription/i,
    ],
    category: 'Health & Medical',
  },

  // Fitness
  {
    patterns: [
      /gym/i, /fitness/i, /planet fitness/i, /equinox/i, /crunch/i,
      /24 hour fitness/i, /la fitness/i, /orangetheory/i, /crossfit/i,
      /peloton/i, /yoga/i, /pilates/i,
    ],
    category: 'Fitness',
  },

  // Entertainment
  {
    patterns: [
      /movie/i, /cinema/i, /amc/i, /regal/i, /theater/i, /theatre/i,
      /concert/i, /ticketmaster/i, /stubhub/i, /eventbrite/i,
      /museum/i, /zoo/i, /amusement/i, /bowling/i, /arcade/i,
      /steam/i, /playstation/i, /xbox/i, /nintendo/i, /gaming/i,
    ],
    category: 'Entertainment',
  },

  // Travel
  {
    patterns: [
      /airline/i, /united/i, /delta/i, /american air/i, /southwest/i,
      /jetblue/i, /spirit/i, /frontier/i, /alaska air/i, /flight/i,
      /hotel/i, /marriott/i, /hilton/i, /hyatt/i, /airbnb/i, /vrbo/i,
      /expedia/i, /booking\.com/i, /kayak/i, /hopper/i, /priceline/i,
    ],
    category: 'Travel',
  },

  // Loans & Credit
  {
    patterns: [
      /student loan/i, /dept.*education/i, /fedloan/i, /nelnet/i,
      /navient/i, /mortgage/i, /car payment/i, /auto loan/i,
      /personal loan/i, /sofi/i, /lending club/i, /credit card payment/i,
    ],
    category: 'Loans',
  },

  // Rent
  {
    patterns: [/rent/i, /landlord/i, /property management/i, /apartment/i],
    category: 'Rent',
  },

  // Transfers
  {
    patterns: [
      /transfer/i, /venmo/i, /zelle/i, /paypal/i, /cash ?app/i,
      /wire/i, /ach.*transfer/i,
    ],
    category: 'Transfers',
  },

  // ATM
  {
    patterns: [/atm/i, /cash withdrawal/i, /cash advance/i],
    category: 'ATM/Cash',
  },

  // Fees
  {
    patterns: [
      /fee/i, /charge/i, /overdraft/i, /nsf/i, /service charge/i,
      /monthly maintenance/i, /atm fee/i, /foreign transaction/i,
    ],
    category: 'Fees',
  },
];

export function categorizeTransaction(transaction: Transaction): string {
  // If already categorized, keep it
  if (transaction.category && transaction.category !== 'Uncategorized') {
    return transaction.category;
  }

  const description = transaction.description.toLowerCase();

  // Income detection
  if (transaction.type === 'income') {
    for (const rule of CATEGORY_RULES.slice(0, 5)) { // First 5 rules are income
      for (const pattern of rule.patterns) {
        if (pattern.test(description)) {
          return rule.category;
        }
      }
    }
    return 'Other Income';
  }

  // Expense categorization
  for (const rule of CATEGORY_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(description)) {
        return rule.category;
      }
    }
  }

  return 'Other';
}

export function categorizeAllTransactions(transactions: Transaction[]): Transaction[] {
  return transactions.map(t => ({
    ...t,
    category: categorizeTransaction(t),
  }));
}
