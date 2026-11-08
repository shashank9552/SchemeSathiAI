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

  await t.test('The first chunk of each scheme start page must not carry previous scheme last sectionTitle (no leak)', () => {
    const p49Chunks = chunks.filter((c) => c.metadata.pageNumber === 49);
    const p50Chunks = chunks.filter((c) => c.metadata.pageNumber === 50);
    const p52Chunks = chunks.filter((c) => c.metadata.pageNumber === 52);

    assert.ok(p49Chunks.length > 0);
    assert.ok(p50Chunks.length > 0);
    assert.ok(p52Chunks.length > 0);

    const lastP49Section = p49Chunks[p49Chunks.length - 1].metadata.sectionTitle;
    const firstP50Section = p50Chunks[0].metadata.sectionTitle;
    const lastP51Chunks = chunks.filter((c) => c.metadata.pageNumber === 51);
    const lastP51Section = lastP51Chunks[lastP51Chunks.length - 1].metadata.sectionTitle;
    const firstP52Section = p52Chunks[0].metadata.sectionTitle;

    // Page 49 ended with How to apply
    assert.match(lastP49Section, /How to apply/i);
    // Page 50 (start of SRI Fund) must reset to Overview and not inherit How to apply
    assert.equal(firstP50Section, 'Overview');
    assert.notEqual(firstP50Section, lastP49Section);

    // Page 52 (start of RAMP) must reset to Overview and not carry prior scheme section
    assert.equal(firstP52Section, 'Overview');
  });

  await t.test('Sub-schemes strictly follow "<subScheme> › <section>" format without repetition or comma lists', () => {
    const p49Chunks = chunks.filter((c) => c.metadata.pageNumber === 49);
    for (const c of p49Chunks) {
      assert.match(
        c.metadata.sectionTitle,
        /^MSME Competitive \(Lean\) Scheme/i,
        `Page 49 chunk must carry Lean subscheme prefix. Actual: "${c.metadata.sectionTitle}"`
      );
      assert.doesNotMatch(c.metadata.sectionTitle, /,/, 'Must not have comma-joined lists');
      assert.doesNotMatch(c.metadata.sectionTitle, /Lean.*Lean/i, 'Must not repeat sub-scheme name');
    }
  });

  await t.test('chunkDocument strictly binds schemeName to outline across all indexed pages', () => {
    // Verify using synthetic multi-page document matching outline
    const testPages: PageContent[] = [
      { pageNumber: 7, text: '• 2nd Loan for up-gradation of existing PMEGP/MUDRA units\nDetailed Information: Second loan eligibility.' },
      { pageNumber: 30, text: 'KHADI & GRAMODYOG VIKAS YOJANA\n1. Modified Market Development Assistance (MMDA)' },
      { pageNumber: 31, text: '4. Strengthening Infrastructure of Existing Weak Khadi Institutions\nII. Gramodyog Vikas Yojana' },
      { pageNumber: 41, text: '1) MSME SUSTAINABLE (ZED) CERTIFICATION\nObjective: The ZED Certification envisages...' },
      { pageNumber: 44, text: '2) MSME INNOVATIVE (INCUBATION, IPR AND DESIGN)\nObjective: To promote innovation...' },
      { pageNumber: 47, text: '3) MSME COMPETITIVE (LEAN) SCHEME\nObjective: Reduction of wastages...' },
    ];

    const fullDocInfo: DocumentInfo = {
      sourceFile: 'MSMESchemebooklet2025-26.pdf',
      documentTitle: 'Ministry of MSME Scheme Booklet 2025-26',
      defaultSchemeName: 'Ministry of MSME Scheme Booklet 2025-26',
      category: 'Business, MSME & Entrepreneurship',
      level: 'central',
      language: 'en',
      outline: [
        { schemeName: 'Prime Minister’s Employment Generation Programme (PMEGP)', startPage: 5, endPage: 6 },
        { schemeName: 'Prime Minister’s Employment Generation Programme (PMEGP)', subScheme: '2nd Loan for up-gradation of existing PMEGP/MUDRA units', startPage: 7, endPage: 8 },
        { schemeName: 'Khadi Gramodyog Vikas Yojana', startPage: 30, endPage: 32 },
        { schemeName: 'MSME Champions Scheme', startPage: 40, endPage: 49 },
      ],
    };

    const generated = chunker.chunkDocument(testPages, fullDocInfo);

    for (const chunk of generated) {
      const p = chunk.metadata.pageNumber;
      if (p === 7) {
        assert.equal(chunk.metadata.schemeName, 'Prime Minister’s Employment Generation Programme (PMEGP)');
        assert.match(chunk.metadata.sectionTitle, /2nd Loan/);
      } else if (p === 30 || p === 31) {
        assert.equal(chunk.metadata.schemeName, 'Khadi Gramodyog Vikas Yojana');
      } else if (p === 41 || p === 44 || p === 47) {
        assert.equal(chunk.metadata.schemeName, 'MSME Champions Scheme');
      }
    }
  });
});
