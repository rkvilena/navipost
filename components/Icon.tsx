import { ICON_PATHS, type IconName } from "~/utils/icon"

interface IconProps {
  name: IconName
  className?: string
  size?: number
}

const Icon = ({ name, className, size = 16 }: IconProps) => {
  const paths = ICON_PATHS[name]

  return (
    <svg
      aria-hidden="true"
      className={className ? `${className} block` : "block"}
      fill="currentColor"
      height={size}
      viewBox="0 0 24 24"
      width={size}>
      {paths.map((path) => (
        <path d={path.d} key={path.d} />
      ))}
    </svg>
  )
}

export default Icon
