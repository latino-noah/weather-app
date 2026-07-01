export default function Puff({ width, height, left, top, opacity, blur, highlightX, highlightY }) {
  const hlX = highlightX ?? 38;
  const hlY = highlightY ?? 35;

  return (
    <div
      className="puff"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        left: `${left}px`,
        top: `${top}px`,
        opacity,
        filter: `blur(${blur ?? 1.2}px)`,
        '--hl-x': `${hlX}%`,
        '--hl-y': `${hlY}%`
      }}
    >
      <div className="puff-highlight" />
      <div className="puff-shadow" />
    </div>
  );
}
