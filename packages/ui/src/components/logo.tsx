import { type ComponentProps } from "solid-js"

// The Common Sapience brand as the platform defines it: a serif wordmark, "Sapience" in italic, and
// the platform's accent colour. The mark is the wordmark's initial on that colour.
const SERIF = `Baskerville, "Iowan Old Style", "Palatino Linotype", "Songti SC", "Noto Serif CJK SC", SimSun, serif`
const ACCENT = "#713e46"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0" y="2" width="16" height="16" rx="3.5" fill={ACCENT} />
      <text x="8" y="15.6" text-anchor="middle" font-family={SERIF} font-weight="700" font-size="13" fill="#ffffff">
        S
      </text>
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0" y="10" width="80" height="80" rx="17.6" fill={ACCENT} />
      <text x="40" y="77.5" text-anchor="middle" font-family={SERIF} font-weight="700" font-size="64" fill="#ffffff">
        S
      </text>
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <text x="0" y="31" font-family={SERIF} font-size="27" letter-spacing="-1.4" fill="var(--icon-strong-base)">
        Common <tspan font-style="italic">Sapience</tspan>
      </text>
    </svg>
  )
}
