import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentChunker, PageContent, DocumentInfo } from '../src/ingestion/chunker.js';

// Real extracted text of pages 49, 50, 51, and 52 from MSMESchemebooklet2025-26.pdf
const page49Text = `• Scheme is also open to Common Facilities Centers
(CFCs) under SFURTI (Scheme of Fund for
Regeneration of Traditional Industries) and Micro &
Small Enterprises - Cluster Development Program
(MSE-CDP) Schemes.
Detailed Information:
• Ministry of Micro, Small & Medium Enterprises,
Government of India, aims to implement the MSME
Competitive (Lean) Scheme for MSMEs with an
objective to enhance their productivity, efficiency,
and competitiveness by reduction of wastages in
processes, inventory management, space
management, energy consumption, etc.
How to apply:
• Eligible MSMEs shall apply through online portal
https://lean.msme.gov.in/`;

const page50Text = `SELF RELIANT INDIA (SRI) FUND
Empowering MSMEs for Aatmanirbhar Bharat
About the scheme:
• India has embarked upon the path of self reliant economic growth for achieving its aspiration of becoming an economic superpower. Towards this end, one of the initiatives taken by the Government of India is the launch of the Self Reliant India (SRI) Fund.
• The Fund structure is designed in a manner that it will leverage the strength of the private sector in providing growth capital to viable MSMEs having a definite growth plan.
Fund Objective:
The Fund aims to provide capital support to the Daughter Funds for onward provision to MSMEs as growth capital, through equity, quasi-equity and debt to achieve the following:
• Supporting faster growth of MSME businesses, thereby igniting the economy & creating several employment opportunities.
• Supporting enterprises which have the potential to graduate beyond the MSME bracket and become National/International champions.
• Supporting MSMEs which will help make India self-reliant by producing relevant technologies, goods and services.
SRI Fund Structure:
• The Ministry of Micro, Small and Medium Enterprises has established, through NSIC Venture Capital Fund Limited (NVCFL) ,an AIF, christened as Self Reliant India (SRI) Fund, having Mother Fund-Daughter Fund structure for ensuring`;

const page51Text = `availability of growth capital to the MSMEs, through equity/quasi-equity/ equity like structured instruments.
This will encourage MSMEs in moving towards listing on the Stock Exchanges, and growing beyond the bracket of MSME.
The AIF will be anchored by NSIC Venture Capital Fund Limited (NVCFL), a wholly owned subsidiary of The National Small Industries Corporation (NSIC), a Mini-Ratna Corporation of the Government of India under the Ministry of Micro, Small and Medium Enterprises (MoMSME).
SRI Fund Features:
Particulars Details
Viable MSMEs with a positive Target Group growth trajectory
Government of India through Total Corpus M/o MSME. Contribution INR 10,000 crore
Tenure of Fund Fund life is 15 years
Disbursement to MSMEs across Scope the country impacting lives and far and wide.
Fund Type Daughter Funds can be categorized I or II AIFs registered with SEBI
Non-Profit Institutions, NBFCs, Exclusions financial inclusion sector, SHGs and other financial intermediaries.
SRI Fund will contribute towards achieving India’s $5 trillion GDP target by creating a vibrant MSME ecosystem, and making an Aatmanirbhar Bharat.
For complete details visit www.nvcfl.co.in`;

const page52Text = `Raising and Accelerating MSME
Performance (RAMP)
About the scheme:
• RAMP is a World Bank supported Central Sector Scheme aimed at improving access of MSMEs to market, finance and technology upgradation by enhancing the outreach of existing MoMSME schemes. The programme also aims at strengthening institutions at the Central and State level, and enhancing Centre- State collaboration.
Objective:
• Accelerating Centre- State collaboration in MSME promotion and development.
• Enhancing effectiveness of existing MoMSME schemes for technology upgradation.
• Strengthening Receivable Financing Market for MSMEs.
• Enhancing effectiveness of Credit Guarantee Trust for Micro & Small Enterprises (CGTMSE), and promoting guarantee for greening initiatives of MSEs, and women owned MSEs.
• Reducing incidence of delayed payments to MSEs.
Key Benefits:
• RAMP scheme would enhance the performance of MSMEs by promoting technology upgradation, innovation, digitization, market access, credit, greening initiatives, etc through active participation of the State Governments.
Target Beneficiaries
• RAMP scheme envisages to benefit more than 5.5 lakh MSMEs during the programme period (FY 2022-23 to 2026-27). The programme implementation will be through the State agencies.`;

test('Chunker Pages 51 and 52 Scheme Attribution Test', async (t) => {
  const chunker = new DocumentChunker();
  const docInfo: DocumentInfo = {
    sourceFile: 'MSMESchemebooklet2025-26.pdf',
    documentTitle: 'Ministry of MSME Scheme Booklet 2025-26',
    defaultSchemeName: 'Ministry of MSME Overview',
    category: 'Business, MSME & Entrepreneurship',
    level: 'central',
    language: 'en',
    outline: [
      { schemeName: 'MSME Champions Scheme', subScheme: 'MSME COMPETITIVE (LEAN) SCHEME', startPage: 47, endPage: 49 },
      { schemeName: 'Self Reliant India (SRI) Fund', startPage: 50, endPage: 51 },
      { schemeName: 'Raising and Accelerating MSME Performance (RAMP)', startPage: 52, endPage: 53 },
    ],
  };

  // Run the REAL multi-page chunking path over pages 49 to 52
  const pages: PageContent[] = [
    { pageNumber: 49, text: page49Text },
    { pageNumber: 50, text: page50Text },
    { pageNumber: 51, text: page51Text },
    { pageNumber: 52, text: page52Text },
  ];

  const chunks = chunker.chunkDocument(pages, docInfo);

  await t.test('Page 49 wrapped line "Small Enterprises - Cluster Development Program" is NOT treated as a scheme heading', () => {
    const p49Chunks = chunks.filter((c) => c.metadata.pageNumber === 49);
    assert.ok(p49Chunks.length > 0, 'Page 49 must produce chunks');
    for (const c of p49Chunks) {
      assert.notEqual(
        c.metadata.schemeName,
        'Small Enterprises - Cluster Development Program',
        `Page 49 mid-sentence wrapped line must NOT become a scheme heading. Actual: "${c.metadata.schemeName}"`
      );
      assert.equal(
        c.metadata.schemeName,
        'MSME Champions Scheme',
        `Page 49 must be attributed to MSME Champions Scheme. Actual: "${c.metadata.schemeName}"`
      );
    }
  });

  await t.test('Page 51 chunks must be attributed to Self Reliant India (SRI) Fund, not MSME SAMADHAAN', () => {
    const p51Chunks = chunks.filter((c) => c.metadata.pageNumber === 51);
    assert.ok(p51Chunks.length > 0, 'Page 51 must produce chunks');
    for (const c of p51Chunks) {
      assert.notEqual(
        c.metadata.schemeName,
        'MSME SAMADHAAN (Delayed Payments Monitoring)',
        `Chunk on page 51 must NOT be misattributed to MSME SAMADHAAN. Actual: "${c.metadata.schemeName}"`
      );
      assert.equal(
        c.metadata.schemeName,
        'Self Reliant India (SRI) Fund',
        `Chunk on page 51 must be attributed to Self Reliant India (SRI) Fund. Actual: "${c.metadata.schemeName}"`
      );
    }
  });

  await t.test('Page 52 chunks must be attributed to Raising and Accelerating MSME Performance (RAMP), not MSME SAMBANDH', () => {
    const p52Chunks = chunks.filter((c) => c.metadata.pageNumber === 52);
    assert.ok(p52Chunks.length > 0, 'Page 52 must produce chunks');
    for (const c of p52Chunks) {
      assert.notEqual(
        c.metadata.schemeName,
        'MSME SAMBANDH (Public Procurement Policy Monitoring)',
        `Chunk on page 52 must NOT be misattributed to MSME SAMBANDH. Actual: "${c.metadata.schemeName}"`
      );
      assert.equal(
        c.metadata.schemeName,
        'Raising and Accelerating MSME Performance (RAMP)',
        `Chunk on page 52 must be attributed to RAMP. Actual: "${c.metadata.schemeName}"`
      );
    }
  });
});
