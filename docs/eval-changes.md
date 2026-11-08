# Evaluation Benchmark Changes Log (`scripts/eval/natural-questions.json`)

## Overview
This document tracks all changes made to [`scripts/eval/natural-questions.json`](file:///c:/dev/SchemeSathi/scripts/eval/natural-questions.json) to ensure strict alignment with the canonical outline in `data/outlines/MSMESchemebooklet2025-26.json` and the official booklet text (`MSMESchemebooklet2025-26.pdf`).

The benchmark consists of 36 natural citizen questions (21 answerable, 15 unanswerable/out-of-scope), reflecting realistic demographic phrasing (age, occupation, intent, no official scheme titles) in English and Hindi.

### Label Drift Explanation
During earlier pipeline iterations, scheme labels were attached to wrong page ranges; chunk bodies came from the PDF; origin of the labels unknown. With the introduction of the canonical document outline (`data/outlines/MSMESchemebooklet2025-26.json`), `schemeName` is bound strictly to the outline's TOC-validated names and page boundaries, resolving all label drift across the corpus.

---

## Before / After Comparison Table: `expectedScheme` (Outline Canonical Alignment)

| Question ID | Question Text (Snippet) | PDF Page | `expectedScheme` Before | `expectedScheme` After (Outline Canonical) | Reason & Corpus Alignment |
|---|---|:---:|---|---|---|
| **NAT-ANS-10** | "I graduated from college and want practical training..." | 15 | `Entrepreneurship Skill Development Programme (ESDP)` | `Entrepreneurship and Skill Development Programme (ESDP) Scheme` | Aligned with TOC canonical scheme name in outline. |
| **NAT-ANS-11** | "Where can rural youth receive hands-on incubation, packaging training..." | 28 | `A Scheme for Promotion of Innovation, Rural Industries and Entrepreneurship (ASPIRE)` | `Scheme for Promotion of Innovation, Rural Industry & Entrepreneurship (ASPIRE)` | Aligned with TOC canonical scheme name in outline. |
| **NAT-ANS-12** | "What assistance is available for traditional weavers and charkha spinners..." | 30 | `Khadi Vikas Yojana` | `Khadi Gramodyog Vikas Yojana` | Sub-schemes merged under single parent scheme in outline. |
| **NAT-ANS-13** | "I want to start beekeeping and honey extraction in my village..." | 31 | `Gramodyog Vikas Yojana` | `Khadi Gramodyog Vikas Yojana` | Sub-schemes merged under single parent scheme in outline. |
| **NAT-ANS-14** | "Can coastal coir rope and mat workers get financial support..." | 18 | `Coir Vikas Yojana` | `Coir Vikas Yojana (CVY)` | Aligned with TOC canonical scheme name in outline. |
| **NAT-ANS-16** | "Can a village blacksmith or carpenter receive financial support to buy a modern kit of tools?" | 36 | `Tool Rooms and Technical Institutions` | `PM Vishwakarma Scheme` | Corrected scheme label: PDF page 36 covers PM Vishwakarma (was mislabeled under legacy label drift). |
| **NAT-ANS-23** | "पारंपरिक कुम्हारों को मिट्टी के बर्तन और दीये बनाने के लिए..." | 31 | `Gramodyog Vikas Yojana` | `Khadi Gramodyog Vikas Yojana` | Sub-schemes merged under single parent scheme in outline. |

---

## Benchmark Field Alignments (`expectedPage` and `expectedPhrase`)

| Question ID | Question Text (Snippet) | Field | Value Before | Value After | Reason & Corpus Alignment |
|---|---|---|---|---|---|
| **NAT-ANS-10** | "I graduated from college and want practical training..." | `expectedPhrase` | `"Entrepreneurship Awareness Programmes"` | `"Entrepreneurship Awareness Programme"` | Corrected singular form to match verbatim chunk text on PDF page 15 ("Entrepreneurship Awareness Programme (EAP)-One Day training programme..."). |
| **NAT-ANS-11** | "Where can rural youth receive hands-on training to start an agro-based..." | `expectedPage` | `16` | `28` | Page 16 was the printed/TOC page. The Livelihood Business Incubators (LBI) / ASPIRE chunk is stored at 1-based PDF page 28 (printed footer "26"). |
| **NAT-ANS-12** | "What assistance is available for traditional weavers and charkha spinners..." | `expectedPage` | `20` | `30` | Khadi Vikas Yojana / MMDA chunks are stored at 1-based PDF page 30 (printed footer "28"). |
| **NAT-ANS-12** | "What assistance is available for traditional weavers and charkha spinners..." | `expectedPhrase` | `"spinners and weavers"` | `"Khadi Artisans"` | "spinners and weavers" does not appear in the booklet text; updated to verbatim chunk text "Khadi Artisans" (PDF page 30). |
| **NAT-ANS-13** | "I want to start beekeeping and honey processing in my village..." | `expectedPage` | `21` | `31` | Gramodyog Vikas Yojana (Honey Mission) chunk is located at 1-based PDF page 31 (printed footer "29"). |
| **NAT-ANS-14** | "Can coastal coir rope and mat workers get financial support to purchase modernized spinning equipment?" | `expectedPage` | `22` | `18` | Coir Vikas Yojana overview chunk is located at 1-based PDF page 18 (printed footer "16"). |
| **NAT-ANS-14** | "Can coastal coir rope and mat workers get financial support to purchase modernized spinning equipment?" | `expectedPhrase` | `"modernization of coir units"` | `"modernization and technological upgradation"` | Chunk on PDF page 18 contains "modernization and technological upgradation of the coir industry"; "modernization of coir units" was not in the text. |
| **NAT-ANS-16** | "Can a village blacksmith or carpenter get subsidized toolkits..." | `expectedPage` | `37` | `36` | PM Vishwakarma toolkit incentive chunk is located at 1-based PDF page 36 (printed footer "34"). |
| **NAT-ANS-17** | "How can a small manufacturer get financial support to patent a new design..." | `expectedPage` | `28` | `40` | MSME Innovative (IPR) chunk is located at 1-based PDF page 40 (printed footer "38"). |
| **NAT-ANS-23** | "पारंपरिक कुम्हारों को मिट्टी के बर्तन और दीये बनाने के लिए बिजली के चाक की सरकारी सहायता कैसे मिलती है?" | `expectedPage` | `21` | `31` | Gramodyog Vikas Yojana (Pottery Activity / electric potter wheel) chunk is on PDF page 31 (printed footer "29"). |
| **NAT-ANS-24** | "क्या अनुसूचित जाति और जनजाति के नए उद्यमियों के लिए सरकार की तरफ से कोई विशेष सहयोग और प्रशिक्षण केंद्र है?" | `expectedPage` | `31` | `26` | National SC-ST Hub chunks are on PDF pages 26-27 (printed footers "24"-"25"). |
| **NAT-ANS-25** | "छोटे कारखाने को गुणवत्ता सुधार और जीरो डिफेक्ट उत्पादन का सरकारी प्रमाण पत्र लेने पर क्या वित्तीय छूट मिलती है?" | `expectedPage` | `27` | `40` | MSME Champions Scheme (ZED / Sustainable) chunks start on PDF page 40 (printed footer "38"). |
