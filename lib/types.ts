export type FundraisingStage =
  | "not_started"
  | "intro_available"
  | "intro_requested"
  | "intro_sent"
  | "meeting_booked"
  | "first_meeting_done"
  | "partner_meeting"
  | "diligence"
  | "passed"
  | "invested";

export const STAGES: { id: FundraisingStage; label: string }[] = [
  { id: "not_started", label: "Not started" },
  { id: "intro_available", label: "Intro available" },
  { id: "intro_requested", label: "Intro requested" },
  { id: "intro_sent", label: "Intro sent" },
  { id: "meeting_booked", label: "Meeting booked" },
  { id: "first_meeting_done", label: "First meeting done" },
  { id: "partner_meeting", label: "Partner meeting" },
  { id: "diligence", label: "Diligence" },
  { id: "passed", label: "Passed" },
  { id: "invested", label: "Invested" },
];

export type Priority = "p0" | "p1" | "p2" | "p3";

export type Investor = {
  id: string;
  full_name: string;
  company_project: string;
  category: string;
  relevance: string;
  node: string;
  notes: string;
  email: string;
  linkedin: string;
  website: string;
  location: string;
  tags: string;
  priority: Priority | "";
  status: string;
  stage: FundraisingStage | "";
  last_contacted: string;
  next_steps: string;
  follow_up_date: string;
  meeting_status: string;
  meeting_notes: string;
  conviction_score: string;
  created_at: string;
  updated_at: string;
};

export const INVESTOR_HEADERS: (keyof Investor)[] = [
  "id",
  "full_name",
  "company_project",
  "category",
  "relevance",
  "node",
  "notes",
  "email",
  "linkedin",
  "website",
  "location",
  "tags",
  "priority",
  "status",
  "stage",
  "last_contacted",
  "next_steps",
  "follow_up_date",
  "meeting_status",
  "meeting_notes",
  "conviction_score",
  "created_at",
  "updated_at",
];

export type IntroRelationship = {
  id: string;
  investor_id: string;
  connector_name: string;
  connector_email: string;
  connector_company: string;
  relationship_strength: string;
  intro_status: "offered" | "requested" | "sent" | "completed" | "declined" | "";
  intro_requested_at: string;
  intro_completed_at: string;
  notes: string;
  created_at: string;
};

export const INTRO_HEADERS: (keyof IntroRelationship)[] = [
  "id",
  "investor_id",
  "connector_name",
  "connector_email",
  "connector_company",
  "relationship_strength",
  "intro_status",
  "intro_requested_at",
  "intro_completed_at",
  "notes",
  "created_at",
];

export type Connector = {
  id: string;
  name: string;
  email: string;
  company: string;
  notes: string;
  created_at: string;
};

export const CONNECTOR_HEADERS: (keyof Connector)[] = [
  "id",
  "name",
  "email",
  "company",
  "notes",
  "created_at",
];

export type ActivityEntry = {
  id: string;
  ts: string;
  actor: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
};

export const ACTIVITY_HEADERS: (keyof ActivityEntry)[] = [
  "id",
  "ts",
  "actor",
  "action",
  "target_type",
  "target_id",
  "details",
];

// Public-safe shape for /board
export type PublicInvestor = Pick<
  Investor,
  "id" | "full_name" | "company_project" | "category" | "relevance" | "tags" | "priority"
>;
