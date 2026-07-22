// sheetMap.ts — map of the master financial sheet. VALIDATE against the live sheet on first run.
//
// The row numbers below are a best-guess reading of a screenshot taken with the
// category groups collapsed, so detail-row boundaries may be off. lib/runway/sheets.ts
// re-reads the live sheet on every use: it confirms each label in column A, parses each
// category's actual SUM range from its formula, and repairs this map before any write.
// The live sheet is truth; this file is a hint.

export type SectionKind = 'inflow' | 'recurringExpense' | 'oneTimeExpense';

export interface CategoryMap {
  key: string;            // stable id used by the app
  label: string;          // exact text expected in column A of the header row
  kind: SectionKind;
  headerRow: number;      // row with the category name + its rolled-up total
  detailStartRow: number; // first line-item row (must be inside the category SUM)
  detailEndRow: number;   // last line-item row (must be inside the category SUM)
  insertStrategy: 'insertAtDetailEnd'; // insert a row AT detailEndRow so it lands inside the SUM
}

export interface SheetMap {
  tab: string;
  nameCol: string;        // 'A'
  totalsCol: string;      // 'B'
  firstMonthCol: string;  // 'C' = the first monthly column (April 2025)
  monthHeaderRow: number; // 1  — headers read "April 2025", "May 2025", ...
  categories: CategoryMap[];
  liquidityRows: { label: string; row: number }[];
  averageBurnCell: string;
  runwayCell: string;
  outOfCashCell: string;
  totalBurnRow: number;
}

export const RIFFLE_SHEET_MAP: SheetMap = {
  tab: 'REPLACE_WITH_MAIN_TAB',
  nameCol: 'A',
  totalsCol: 'B',
  firstMonthCol: 'C',
  monthHeaderRow: 1,
  categories: [
    // Capital Inflow (investor checks)
    { key: 'capital_inflow', label: 'Capital Inflow', kind: 'inflow',
      headerRow: 2, detailStartRow: 3, detailEndRow: 22, insertStrategy: 'insertAtDetailEnd' },

    // Operating Burn (recurring) — each is a collapsible group
    { key: 'people', label: 'People', kind: 'recurringExpense',
      headerRow: 26, detailStartRow: 27, detailEndRow: 64, insertStrategy: 'insertAtDetailEnd' },
    { key: 'op_software', label: 'Operating Software/Infra', kind: 'recurringExpense',
      headerRow: 65, detailStartRow: 66, detailEndRow: 101, insertStrategy: 'insertAtDetailEnd' },
    { key: 'overhead_software', label: 'Overhead Software/Infra', kind: 'recurringExpense',
      headerRow: 102, detailStartRow: 103, detailEndRow: 138, insertStrategy: 'insertAtDetailEnd' },
    { key: 'office_ga', label: 'Office/G&A', kind: 'recurringExpense',
      headerRow: 139, detailStartRow: 140, detailEndRow: 153, insertStrategy: 'insertAtDetailEnd' },
    { key: 'marketing', label: 'Marketing', kind: 'recurringExpense',
      headerRow: 154, detailStartRow: 155, detailEndRow: 170, insertStrategy: 'insertAtDetailEnd' },
    { key: 'finance_legal', label: 'Finance & Legal', kind: 'recurringExpense',
      headerRow: 171, detailStartRow: 172, detailEndRow: 181, insertStrategy: 'insertAtDetailEnd' },

    // One Time Burn
    { key: 'draft', label: 'Draft', kind: 'oneTimeExpense',
      headerRow: 184, detailStartRow: 185, detailEndRow: 287, insertStrategy: 'insertAtDetailEnd' },
    { key: 'security_deposits', label: 'Security Deposits', kind: 'oneTimeExpense',
      headerRow: 288, detailStartRow: 289, detailEndRow: 298, insertStrategy: 'insertAtDetailEnd' },
    { key: 'other_capex', label: 'Other Capex', kind: 'oneTimeExpense',
      headerRow: 299, detailStartRow: 300, detailEndRow: 311, insertStrategy: 'insertAtDetailEnd' },
  ],
  liquidityRows: [
    { label: 'HSBC', row: 316 },
    { label: 'IDFC', row: 317 },
    { label: 'Mercury Checking', row: 318 },
    { label: 'Mercury Treasury', row: 319 },
  ],
  averageBurnCell: 'B321',
  runwayCell: 'B322',
  outOfCashCell: 'B323',
  totalBurnRow: 313,
};
