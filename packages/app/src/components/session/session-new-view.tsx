import { useLanguage } from "@/context/language"

const ROOT_CLASS = "size-full flex flex-col"

interface NewSessionViewProps {
  worktree: string
}

// The empty session: one line, no logo, no directory. Every session runs in the same directory
// (D-04), so there is nothing about the place to tell the user before their first message.
export function NewSessionView(_props: NewSessionViewProps) {
  const language = useLanguage()

  return (
    <div class={ROOT_CLASS}>
      <div class="h-12 shrink-0" aria-hidden />
      <div class="flex-1 px-6 pb-30 flex items-center justify-center text-center">
        <div class="text-20-medium text-text-strong">{language.t("session.new.title")}</div>
      </div>
    </div>
  )
}
