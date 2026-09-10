export type AppRole = "admin" | "hr";
export type EmploymentType = "full_time" | "part_time" | "contract" | "intern";
export type OfferStatus = "draft" | "awaiting_signature" | "signed" | "revoked" | "expired";
export type DayStatus =
  | "present"
  | "absent"
  | "half_day"
  | "leave"
  | "week_off"
  | "holiday"
  | "unmatched";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
};

export type CompanySettings = {
  id: number;
  company_name: string;
  legal_name: string;
  address: string;
  city: string;
  website: string;
  hr_email: string;
  logo_url: string | null;
  work_start: string;
  work_end: string;
  expected_hours: number;
  late_grace_minutes: number;
  half_day_hours: number;
  weekly_offs: number[];
  offer_validity_days: number;
  offer_footer: string;
};

export type Employee = {
  id: string;
  employee_code: string;
  full_name: string;
  email: string | null;
  department: string | null;
  designation: string | null;
  joining_date: string | null;
  is_active: boolean;
};

export type Holiday = {
  id: string;
  holiday_date: string;
  name: string;
};

export type OfferLetter = {
  id: string;
  created_by: string | null;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string | null;
  position: string;
  department: string | null;
  employment_type: EmploymentType;
  location: string | null;
  ctc_annual: number | null;
  ctc_currency: string;
  joining_date: string | null;
  reporting_manager: string | null;
  probation_months: number;
  notice_period_days: number;
  custom_body: string | null;
  benefits: string | null;
  status: OfferStatus;
  signing_token: string;
  token_expires_at: string | null;
  sent_for_signature_at: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signature_data: string | null;
  signer_ip: string | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicOffer = {
  id: string;
  candidate_name: string;
  candidate_email: string;
  position: string;
  department: string | null;
  employment_type: EmploymentType;
  location: string | null;
  ctc_annual: number | null;
  ctc_currency: string;
  joining_date: string | null;
  reporting_manager: string | null;
  probation_months: number;
  notice_period_days: number;
  custom_body: string | null;
  benefits: string | null;
  status: OfferStatus;
  token_expires_at: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signature_data: string | null;
  company_name: string;
  legal_name: string;
  address: string;
  city: string;
  website: string;
  offer_footer: string;
};

export type AttendanceDay = {
  id: string;
  upload_id: string | null;
  employee_id: string | null;
  employee_code: string | null;
  employee_name: string;
  work_date: string;
  punch_in: string | null;
  punch_out: string | null;
  hours_worked: number;
  is_late: boolean;
  late_by_minutes: number;
  status: DayStatus;
  source_note: string | null;
};

export type MonthlySummary = {
  id: string;
  employee_id: string | null;
  employee_code: string | null;
  employee_name: string;
  period_month: number;
  period_year: number;
  working_days: number;
  present_days: number;
  absent_days: number;
  leave_days: number;
  half_days: number;
  week_offs: number;
  holidays: number;
  late_days: number;
  total_hours: number;
  overtime_hours: number;
};

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  intern: "Internship",
};

export const STATUS_LABELS: Record<OfferStatus, string> = {
  draft: "Draft",
  awaiting_signature: "Awaiting signature",
  signed: "Signed & sent",
  revoked: "Revoked",
  expired: "Expired",
};

export const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  present: "Present",
  absent: "Absent",
  half_day: "Half day",
  leave: "Leave",
  week_off: "Week off",
  holiday: "Holiday",
  unmatched: "Unmatched",
};
