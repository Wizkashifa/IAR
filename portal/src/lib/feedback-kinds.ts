/** Feedback kinds, shared by the server store and the browser form. */
export type FeedbackKind = "problem" | "idea" | "question";

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  problem: "Something's wrong",
  idea: "An idea",
  question: "A question",
};
