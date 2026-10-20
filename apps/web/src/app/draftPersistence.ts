import type { InputDraft } from "../view-contract";
export const DRAFT_KEY = "pc-poem-draft-v1";
export const EMPTY_DRAFT: InputDraft = {
  text: "",
  rhymeBook: "pingshui",
  genreHint: "auto",
  formHint: "auto",
};
export function parseSavedDraft(raw: string | null): InputDraft {
  try {
    const saved = JSON.parse(raw ?? "null") as InputDraft | null;
    if (
      !saved ||
      typeof saved.text !== "string" ||
      [...saved.text].length > 2000 ||
      !["pingshui", "cilin", "xinyun"].includes(saved.rhymeBook) ||
      !["auto", "regulated", "ancient"].includes(saved.genreHint) ||
      !["auto", "wujue", "qijue", "wulv", "qilv"].includes(saved.formHint) ||
      (saved.genreHint === "ancient" && saved.formHint !== "auto")
    )
      return { ...EMPTY_DRAFT };
    return {
      text: saved.text,
      rhymeBook: saved.rhymeBook,
      genreHint: saved.genreHint,
      formHint: saved.formHint,
    };
  } catch {
    return { ...EMPTY_DRAFT };
  }
}
export function loadSavedDraft(): InputDraft {
  try {
    return parseSavedDraft(window.localStorage.getItem(DRAFT_KEY));
  } catch {
    return { ...EMPTY_DRAFT };
  }
}
