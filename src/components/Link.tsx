interface LinkProps {
  children: string
  href: string
}

export default function Link(props: LinkProps) {
  const { children, href } = props
  return (
    <a
      href={href}
      className="font-medium text-primary-400 hover:text-primary-300 underline underline-offset-2 decoration-primary-400/30 hover:decoration-primary-400/60 transition-colors duration-200"
    >
      {children}
    </a>
  )
}
