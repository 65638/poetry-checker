export const OPEN_STUDY_EVENT = "poetry-open-saved-study";

export function openSavedStudy(id: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_STUDY_EVENT, { detail: { id } }));
}
