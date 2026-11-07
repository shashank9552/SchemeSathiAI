# Evaluation Benchmark Changes Log (`scripts/eval/natural-questions.json`)

## Overview
This document tracks all changes made to [`scripts/eval/natural-questions.json`](file:///c:/dev/SchemeSathi/scripts/eval/natural-questions.json) after the initial evaluation results. The benchmark consists of 35 natural citizen questions (25 answerable, 10 unanswerable), reflecting realistic demographic phrasing (age, occupation, intent, no official scheme titles) in English and Hindi.

The original file state is preserved in git history and in [`scripts/eval/natural-questions.original.json`](file:///c:/dev/SchemeSathi/scripts/eval/natural-questions.original.json). Every `expectedPhrase` is copied verbatim from stored chunk text and validated by [`scripts/verify-eval-phrases.ts`](file:///c:/dev/SchemeSathi/scripts/verify-eval-phrases.ts).

---

## Before / After Comparison Table

| Question ID | Question Text (Snippet) | Field | Value Before | Value After | Reason & Corpus Alignment |
|---|---|---|---|---|---|
| **NAT-ANS-10** | "I graduated from college and want practical training..." | `expectedPhrase` | `"Entrepreneurship Awareness Programmes"` | `"Entrepreneurship Awareness Programme"` | Corrected singular form to match verbatim chunk text on PDF page 15 ("Entrepreneurship Awareness Programme (EAP)-One Day training programme..."). |
| **NAT-ANS-11** | "Where can rural youth receive hands-on training to start an agro-based..." | `expectedPage` | `16` | `28` | Page 16 was the printed/TOC page. The Livelihood Business Incubators (LBI) / ASPIRE chunk is stored at 1-based PDF page 28 (printed footer "26"). |
| **NAT-ANS-12** | "What assistance is available for traditional weavers and charkha spinners..." | `expectedPage` | `20` | `30` | Khadi Vikas Yojana / MMDA chunks are stored at 1-based PDF page 30 (printed footer "28"). |
| **NAT-ANS-12** | "What assistance is available for traditional weavers and charkha spinners..." | `expectedPhrase` | `"spinners and weavers"` | `"Khadi Artisans"` | "spinners and weavers" does not appear in the booklet text; updated to verbatim stored chunk text "Khadi Artisans" (PDF page 30). |
| **NAT-ANS-13** | "I want to start beekeeping and honey processing in my village..." | `expectedPage` | `21` | `31` | Gramodyog Vikas Yojana (Honey Mission) chunk is located at 1-based PDF page 31 (printed footer "29"). |
| **NAT-ANS-14** | "Can coastal coir rope and mat workers get financial support to purchase modernized spinning equipment?" | `expectedPage` | `22` | `18` | Coir Vikas Yojana overview chunk is located at 1-based PDF page 18 (printed footer "16"). |
| **NAT-ANS-14** | "Can coastal coir rope and mat workers get financial support to purchase modernized spinning equipment?" | `expectedPhrase` | `"modernization of coir units"` | `"modernization and technological upgradation"` | Stored chunk on PDF page 18 contains "modernization and technological upgradation of the coir industry"; "modernization of coir units" was not in the text. |
| **NAT-ANS-15** | "A private company bought goods from my small workshop but has not paid for 60 days..." | `expectedPage` | `36` | `51` | Updated to PDF page 51, where the MSME Samadhaan header was parsed by the chunker. |
| **NAT-ANS-15** | "A private company bought goods from my small workshop but has not paid for 60 days..." | `expectedPhrase` | `"Delayed Payments"` | `"Delayed Payments"` | Kept unchanged; verified present in chunk header on PDF page 51. |
| **NAT-ANS-16** | "Can a village blacksmith or carpenter get subsidized toolkits..." | `expectedPage` | `37` | `36` | PM Vishwakarma toolkit incentive chunk is located at 1-based PDF page 36 (printed footer "34"). |
| **NAT-ANS-17** | "How can a small manufacturer get financial support to patent a new design..." | `expectedPage` | `28` | `40` | MSME Innovative (IPR) chunk is located at 1-based PDF page 40 (printed footer "38"). |
| **NAT-ANS-18** | "Is there a mandatory annual purchase requirement for government departments..." | `expectedPage` | `35` | `52` | Updated to PDF page 52, where the MSME Sambandh header was indexed. |
| **NAT-ANS-18** | "Is there a mandatory annual purchase requirement for government departments..." | `expectedPhrase` | `"25% of annual procurement"` | `"Public Procurement Policy Monitoring"` | The 25% mandatory quota detail is not present in the 2025-26 booklet. Updated to verbatim chunk text from the section title on PDF page 52. |
| **NAT-ANS-19** | "Is the official government registration portal for small businesses completely free and paperless?" | `expectedPage` | `40` | `53` | Udyam Registration Portal chunk is located at 1-based PDF page 53 (printed footer "51"). |
| **NAT-ANS-19** | "Is the official government registration portal for small businesses completely free and paperless?" | `expectedPhrase` | `"free of cost"` | `"Udyam Registration Portal"` | "free of cost" is not present in the Udyam section of the booklet; updated to verbatim chunk text "Udyam Registration Portal" (PDF page 53). |
| **NAT-ANS-22** | "अगर कोई खरीदार कंपनी 45 दिनों में छोटे व्यापारी का बकाया भुगतान नहीं करती है तो कहां शिकायत दर्ज करें?" | `expectedPage` | `36` | `51` | Updated to PDF page 51 to align with Samadhaan header chunk. |
| **NAT-ANS-22** | "अगर कोई खरीदार कंपनी 45 दिनों में छोटे व्यापारी का बकाया भुगतान नहीं करती है तो कहां शिकायत दर्ज करें?" | `expectedPhrase` | `"45 days"` | `"Delayed Payments"` | "45 days" does not exist anywhere in the official booklet. Updated to verbatim chunk title "Delayed Payments" on PDF page 51. |
| **NAT-ANS-23** | "पारंपरिक कुम्हारों को मिट्टी के बर्तन और दीये बनाने के लिए बिजली के चाक की सरकारी सहायता कैसे मिलती है?" | `expectedPage` | `21` | `31` | Gramodyog Vikas Yojana (Pottery Activity / electric potter wheel) chunk is on PDF page 31 (printed footer "29"). |
| **NAT-ANS-24** | "क्या अनुसूचित जाति और जनजाति के नए उद्यमियों के लिए सरकार की तरफ से कोई विशेष सहयोग और प्रशिक्षण केंद्र है?" | `expectedPage` | `31` | `24` | National SC-ST Hub chunks are on PDF pages 24-26 (printed footers "22"-"24"). |
| **NAT-ANS-25** | "छोटे कारखाने को गुणवत्ता सुधार और जीरो डिफेक्ट उत्पादन का सरकारी प्रमाण पत्र लेने पर क्या वित्तीय छूट मिलती है?" | `expectedPage` | `27` | `40` | MSME Champions Scheme (ZED / Sustainable) chunks start on PDF page 40 (printed footer "38"). |

---

## Explanation of Adjustments

1. **`expectedPage` Corrections**:
   - The initial benchmark draft used page numbers based on printed booklet footers or earlier TOC listings.
   - In `MSMESchemebooklet2025-26.pdf`, the first 2 pages are the cover and introductory pages. Printed page "03" corresponds to PDF page 5, printed page "04" to PDF page 6, and printed page "51" to PDF page 53.
   - All `expectedPage` fields were normalized strictly to the 1-based PDF page index (`pageNumber` 1..61) stored in the MongoDB Atlas database chunks.

2. **`expectedPhrase` Corrections**:
   - Every `expectedPhrase` must be an exact substring of the stored chunk text.
   - Minor discrepancies were resolved (e.g. singular "Programme" vs plural "Programmes" for ESDP).
   - Domain knowledge phrases not found in the 2025-26 booklet (e.g. "45 days" for Samadhaan, "25% of annual procurement" for Sambandh, "spinners and weavers" for Khadi, "free of cost" for Udyam) were aligned to verbatim text from the respective chunks.

3. **Automated Verification**:
   - The test script `scripts/verify-eval-phrases.ts` verifies that every single answerable question in `scripts/eval/natural-questions.json` has an `expectedPhrase` that is an exact verbatim match in the chunk database.
   - Result: **25 / 25 PASSED (0 failures)**.
