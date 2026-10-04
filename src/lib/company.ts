// Company details shown on reservation confirmations (same as the website's src/lib/company.ts).
export const COMPANY_NAME = "Arami Vacation Homes Rental CO.L.L.C.";
export const COMPANY_ADDRESS = "Al Diyar - Office 3, Al Wasl, Rag Business Centre, Dubai, UAE";
export const COMPANY_PHONE = "+971 55 866 1589";
export const COMPANY_WEBSITE = "www.aramivhr.com";

export function reservationNumber(id: string) {
  return `RES-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
