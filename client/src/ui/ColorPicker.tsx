interface Props {
  colors: string[]
  value: string
  onChange: (color: string) => void
}

export default function ColorPicker({ colors, value, onChange }: Props) {
  return (
    <div className="color-picker">
      {colors.map((color) => (
        <button
          key={color}
          className={`color-swatch ${value === color ? 'active' : ''}`}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  )
}
