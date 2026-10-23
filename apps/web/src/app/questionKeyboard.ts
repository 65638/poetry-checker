import type { KeyboardEvent } from "react";

/** Keep Enter for line breaks and IME confirmation; only an explicit shortcut submits. */
export function submitQuestionShortcut(
  event: KeyboardEvent<HTMLTextAreaElement>,
  disabled: boolean,
) {
  if (
    event.key !== "Enter" ||
    !(event.ctrlKey || event.metaKey) ||
    event.altKey ||
    event.nativeEvent.isComposing ||
    event.nativeEvent.keyCode === 229
  )
    return;
  event.preventDefault();
  if (!disabled && !event.repeat) event.currentTarget.form?.requestSubmit();
}
