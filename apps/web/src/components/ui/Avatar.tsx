import { Icon } from '../../lib/icons'

interface Props {
  url: string | null
  size?: number
  alt?: string
}

// The circle itself, with no idea where the URL came from — the topbar and the
// settings preview both render this, at different sizes.
export function Avatar({ url, size = 28, alt = '' }: Props) {
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {url
        ? <img className="avatar-img" src={url} alt={alt} width={size} height={size} />
        : <Icon name="person" size={Math.round(size * 0.62)} />}
    </span>
  )
}
