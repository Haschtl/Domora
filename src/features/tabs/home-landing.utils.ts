export const getSavedLandingMarkdown = (markdown: string | null | undefined) => markdown ?? "";

export const canEditLandingByRole = (role: "owner" | "member" | null | undefined) => role === "owner";

export const shouldResetDraftOnDialogClose = (open: boolean, isSaving: boolean) => !open && !isSaving;
