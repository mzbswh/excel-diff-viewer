import type * as XLSX from 'xlsx';

export const workbookReadOptions: XLSX.ParsingOptions = {
  type: 'array',
  cellDates: true,
  cellFormula: true,
  cellNF: true,
  cellHTML: false,
  cellText: false
};
